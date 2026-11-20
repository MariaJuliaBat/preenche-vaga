// Testes do Dashboard (D1 a D13): servidor real em porta livre, pasta output/ temporária e CLI falsa. Só dados fictícios.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { criarServidor, HOST } = require("../../dashboard/server");
const { criarExecutor } = require("../../dashboard/executor");
const { calcularCota, lerLog } = require("../../dashboard/dados");

function ambiente() {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), "dash-"));
  const config = { autoSubmit: false, pastas: { saida, curriculos: path.join(saida, "cvs"), logs: path.join(saida, "logs") } };
  fs.mkdirSync(config.pastas.curriculos, { recursive: true });
  fs.mkdirSync(config.pastas.logs, { recursive: true });
  return config;
}

/** Processo falso: guarda os argumentos e deixa o teste decidir quando termina. */
function spawnFalso() {
  const chamadas = [];
  const impl = (_cmd, args) => {
    const filho = new EventEmitter();
    filho.stdout = new EventEmitter();
    filho.stderr = new EventEmitter();
    chamadas.push({ args, filho });
    return filho;
  };
  return { impl, chamadas };
}

async function subir(config, executor) {
  const servidor = criarServidor({ config, executor });
  await new Promise((resolve) => servidor.listen(0, HOST, resolve));
  const { port, address } = servidor.address();
  const base = `http://${HOST}:${port}`;
  return { servidor, base, address, fechar: () => new Promise((r) => servidor.close(r)) };
}

const postar = (base, corpo, cabecalhos = {}) => fetch(`${base}/api/execucoes`, {
  method: "POST", headers: { "Content-Type": "application/json", ...cabecalhos }, body: JSON.stringify(corpo)
});

test("D1: o servidor escuta só em 127.0.0.1", async () => {
  const s = await subir(ambiente(), criarExecutor());
  assert.strictEqual(s.address, "127.0.0.1");
  await s.fechar();
});

test("D9 e D10: Cota DF por lote; sem lote não vira 0%", () => {
  assert.deepStrictEqual(
    (({ total, emDF, remotas, percentual, cotaNecessaria, atingida }) => ({ total, emDF, remotas, percentual, cotaNecessaria, atingida }))(calcularCota([{ ehVagaDF: true }, { ehVagaDF: true }, { ehVagaDF: false }, { ehVagaDF: false }])),
    { total: 4, emDF: 2, remotas: 2, percentual: 50, cotaNecessaria: 2, atingida: true }
  );
  assert.strictEqual(calcularCota([{ ehVagaDF: true }, { ehVagaDF: false }, { ehVagaDF: false }, { ehVagaDF: false }]).atingida, false);
  assert.strictEqual(calcularCota([{ ehVagaDF: true }, { ehVagaDF: false }, { ehVagaDF: false }, { ehVagaDF: false }]).percentual, 25);
  for (const vazio of [[], null, undefined]) {
    const c = calcularCota(vazio);
    assert.deepStrictEqual([c.semLote, c.percentual, c.atingida], [true, null, null]);
  }
});

test("D9: /api/estado traz a cota do lote salvo, sem dados do currículo", async () => {
  const config = ambiente();
  fs.writeFileSync(path.join(config.pastas.saida, "lote.json"), JSON.stringify({
    geradoEm: "2026-01-01T00:00:00.000Z",
    vagas: [{ titulo: "Dev A", empresa: "Acme", url: "https://v.exemplo/a", ehVagaDF: true, pontos: 4, descricao: "texto longo" }, { titulo: "Dev B", ehVagaDF: false, pontos: 2 }]
  }));
  fs.writeFileSync(path.join(config.pastas.saida, "perfil.json"), JSON.stringify({ perfil: { identificacao: { nome: "Maria Exemplo" } } }));
  const s = await subir(config, criarExecutor());
  const estado = await (await fetch(`${s.base}/api/estado`)).json();
  assert.strictEqual(estado.cota.percentual, 50);
  assert.strictEqual(estado.cota.atingida, true);
  assert.deepStrictEqual(estado.contagens, { pendencias: 0, pistas: 0, descartes: 0 });
  assert.ok(!JSON.stringify(estado).includes("Maria Exemplo") && !JSON.stringify(estado).includes("texto longo"));
  await s.fechar();
});

test("D2: Host de outro nome é recusado (DNS rebinding)", async () => {
  const s = await subir(ambiente(), criarExecutor());
  const { status } = await new Promise((resolve, reject) => {
    const http = require("node:http");
    http.get({ host: HOST, port: new URL(s.base).port, path: "/api/estado", headers: { Host: "atacante.exemplo" } }, (r) => { r.resume(); resolve({ status: r.statusCode }); }).on("error", reject);
  });
  assert.strictEqual(status, 403);
  await s.fechar();
});

test("D3: POST de outra origem ou sem JSON é recusado e nada é iniciado", async () => {
  const falso = spawnFalso();
  const s = await subir(ambiente(), criarExecutor({ spawnImpl: falso.impl }));
  assert.strictEqual((await postar(s.base, { etapa: "curriculo" }, { Origin: "https://site-qualquer.exemplo" })).status, 403);
  const semJson = await fetch(`${s.base}/api/execucoes`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
  assert.strictEqual(semJson.status, 403);
  assert.strictEqual(falso.chamadas.length, 0);
  assert.strictEqual((await postar(s.base, { etapa: "curriculo" }, { Origin: s.base })).status, 202); // a própria tela passa
  await s.fechar();
});

test("D4 e D6: simulação por padrão; sem simulação exige confirmar; etapa desconhecida é recusada", async () => {
  const falso = spawnFalso();
  const s = await subir(ambiente(), criarExecutor({ spawnImpl: falso.impl }));

  assert.strictEqual((await postar(s.base, { etapa: "apply" })).status, 400);
  assert.strictEqual((await postar(s.base, { etapa: "enviar-tudo" })).status, 400);
  assert.strictEqual((await postar(s.base, { etapa: "curriculo", dryRun: false })).status, 400);
  assert.strictEqual(falso.chamadas.length, 0);

  assert.strictEqual((await postar(s.base, { etapa: "curriculo" })).status, 202);
  assert.deepStrictEqual(falso.chamadas[0].args.slice(1), ["--only-cv", "--dry-run"]);
  falso.chamadas[0].filho.emit("close", 0);

  assert.strictEqual((await postar(s.base, { etapa: "radar", dryRun: false, confirmar: true })).status, 202);
  assert.deepStrictEqual(falso.chamadas[1].args.slice(1), ["--only-radar"]);
  await s.fechar();
});

test("D15 e D16: candidatura começa em simulação; sem simulação exige confirmar E confirmarEnvioReal", async () => {
  const falso = spawnFalso();
  const s = await subir(ambiente(), criarExecutor({ spawnImpl: falso.impl }));

  assert.strictEqual((await postar(s.base, { etapa: "candidatura" })).status, 202); // sem corpo extra: simulação
  assert.deepStrictEqual(falso.chamadas[0].args.slice(1), ["--only-apply", "--dry-run"]);
  falso.chamadas[0].filho.emit("close", 0);

  // desligar a simulação, só com a confirmação da planilha, não basta: pode ENVIAR de verdade
  assert.strictEqual((await postar(s.base, { etapa: "candidatura", dryRun: false })).status, 400);
  assert.strictEqual((await postar(s.base, { etapa: "candidatura", dryRun: false, confirmar: true })).status, 400);
  assert.strictEqual((await postar(s.base, { etapa: "candidatura", dryRun: false, confirmarEnvioReal: true })).status, 400); // falta confirmar
  assert.strictEqual(falso.chamadas.length, 1);

  assert.strictEqual((await postar(s.base, { etapa: "candidatura", dryRun: false, confirmar: true, confirmarEnvioReal: true })).status, 202);
  assert.deepStrictEqual(falso.chamadas[1].args.slice(1), ["--only-apply"]); // o AUTO_SUBMIT continua mandando na CLI
  await s.fechar();
});

test("D17: login abre o navegador por portal (gupy, trampos ou em branco); LinkedIn e outros são recusados; sem --dry-run", async () => {
  const falso = spawnFalso();
  const s = await subir(ambiente(), criarExecutor({ spawnImpl: falso.impl }));

  for (const portal of ["linkedin", "programathor", "../x"]) assert.strictEqual((await postar(s.base, { etapa: "login", portal })).status, 400, portal);
  assert.strictEqual(falso.chamadas.length, 0);

  assert.strictEqual((await postar(s.base, { etapa: "login", portal: "gupy" })).status, 202);
  assert.deepStrictEqual(falso.chamadas[0].args.slice(1), ["--login", "gupy"]);
  falso.chamadas[0].filho.emit("close", 0);

  assert.strictEqual((await postar(s.base, { etapa: "login" })).status, 202);
  assert.deepStrictEqual(falso.chamadas[1].args.slice(1), ["--login"]);
  await s.fechar();
});

test("D5: uma Execução por vez; a saída da CLI chega à tela e o fim registra o código", async () => {
  const falso = spawnFalso();
  const s = await subir(ambiente(), criarExecutor({ spawnImpl: falso.impl }));
  assert.strictEqual((await postar(s.base, { etapa: "curriculo" })).status, 202);
  assert.strictEqual((await postar(s.base, { etapa: "radar" })).status, 409);

  falso.chamadas[0].filho.stdout.emit("data", Buffer.from("Currículos sob medida gerados: 1\n"));
  let exec = await (await fetch(`${s.base}/api/execucao`)).json();
  assert.strictEqual(exec.rodando, true);
  assert.ok(exec.linhas.includes("Currículos sob medida gerados: 1"));

  falso.chamadas[0].filho.emit("close", 0);
  exec = await (await fetch(`${s.base}/api/execucao`)).json();
  assert.deepStrictEqual([exec.rodando, exec.codigo], [false, 0]);
  assert.strictEqual((await postar(s.base, { etapa: "radar" })).status, 202); // liberou
  await s.fechar();
});

test("D7 e D8: lista PDFs, abre dentro da tela e bloqueia caminho fora da pasta", async () => {
  const config = ambiente();
  fs.writeFileSync(path.join(config.pastas.curriculos, "01-vaga.pdf"), "%PDF-1.4 falso");
  fs.writeFileSync(path.join(config.pastas.curriculos, "nota.txt"), "x");
  fs.writeFileSync(path.join(config.pastas.saida, "segredo.pdf"), "%PDF-1.4 fora");
  const s = await subir(config, criarExecutor());

  const lista = await (await fetch(`${s.base}/api/curriculos`)).json();
  assert.deepStrictEqual(lista.map((p) => p.nome), ["01-vaga.pdf"]);

  const ok = await fetch(`${s.base}/cvs/01-vaga.pdf`);
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.headers.get("content-type"), "application/pdf");
  assert.strictEqual(ok.headers.get("content-disposition"), "inline");

  for (const ruim of ["..%2Fsegredo.pdf", "%2e%2e%2fsegredo.pdf", "nota.txt", "..%5Csegredo.pdf", "nao-existe.pdf"]) {
    assert.strictEqual((await fetch(`${s.base}/cvs/${ruim}`)).status, 404, ruim);
  }
  await s.fechar();
});

test("D11, D12 e D14: logs mais recentes primeiro, contagem por motivo, linha quebrada ignorada, arquivo ausente vazio", async () => {
  const config = ambiente();
  const linhas = [
    { data: "2026-01-01", titulo: "A", motivo: "nível", detalhe: "pleno" },
    { data: "2026-01-02", titulo: "B", motivo: "área" },
    { data: "2026-01-03", titulo: "C", motivo: "nível" }
  ].map((l) => JSON.stringify(l));
  fs.writeFileSync(path.join(config.pastas.logs, "descartes.jsonl"), `${linhas[0]}\n{quebrada\n${linhas[1]}\n${linhas[2]}\n`);
  const d = lerLog(config, "descartes");
  assert.deepStrictEqual(d.registros.map((r) => r.titulo), ["C", "B", "A"]);
  assert.deepStrictEqual(d.porMotivo, { "nível": 2, "área": 1 });
  assert.strictEqual(d.total, 3);

  const s = await subir(config, criarExecutor());
  const pendencias = await (await fetch(`${s.base}/api/auditoria/pendencias`)).json();
  assert.deepStrictEqual([pendencias.existe, pendencias.total], [false, 0]);
  assert.strictEqual((await fetch(`${s.base}/api/auditoria/segredos`)).status, 404);
  await s.fechar();
});

test("D13: a tela só usa textContent para dado do Pipeline (nada de innerHTML)", () => {
  const app = fs.readFileSync(path.join(__dirname, "../../dashboard/public/app.js"), "utf8");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(app));
});

test("a página estática vem com CSP restritiva", async () => {
  const s = await subir(ambiente(), criarExecutor());
  const r = await fetch(`${s.base}/`);
  assert.strictEqual(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /default-src 'self'/);
  await s.fechar();
});
