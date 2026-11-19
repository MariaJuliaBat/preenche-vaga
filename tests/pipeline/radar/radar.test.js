// Testes do Radar (RD1 a RD4, RD17 a RD22): Conectores falsos, planilha falsa, nenhuma rede.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { executarRadar } = require("../../../pipeline/radar");
const { criarEtapaRadar } = require("../../../pipeline/radar/etapa");
const { criarConectoresGithub } = require("../../../pipeline/radar/conectores/github");
const { montarConfig } = require("../../../pipeline/config");
const { resultadoVazio } = require("../../../pipeline/resumo");
const logs = require("../../../pipeline/logs");

const HOJE = new Date("2026-11-19T12:00:00Z");
const RECENTE = "2026-11-15T10:00:00Z";

let contador = 0;
const vagaDF = (extra = {}) => ({
  titulo: `Dev Júnior ${++contador}`, url: `https://vagas.exemplo/df/${contador}`, descricao: "Time de produto.",
  rotulos: ["Híbrido", "Brasília - DF"], publicadaEm: RECENTE, ...extra
});
const vagaRemota = (extra = {}) => ({
  titulo: `Dev Júnior Remoto ${++contador}`, url: `https://vagas.exemplo/r/${contador}`, descricao: "Time de produto.",
  rotulos: ["Remoto"], publicadaEm: RECENTE, ...extra
});

/** Conector falso: devolve listas por foco e guarda as consultas recebidas. */
function conectorFalso(nome, { geral = [], df = [], falha = false } = {}) {
  const consultas = [];
  return {
    consultas,
    nome,
    async buscar({ foco }) {
      consultas.push(foco);
      if (falha) throw new Error("erro 500 simulado");
      return foco === "df" ? df : geral;
    }
  };
}

const rodar = (conectores, extra = {}) => executarRadar({ conectores, hoje: HOJE, ...extra });

test("RD17: cota não atingida dispara UMA segunda busca no DF, que resolve a cota", async () => {
  const c = conectorFalso("A", {
    geral: [vagaDF(), vagaRemota(), vagaRemota(), vagaRemota()],
    df: [vagaDF(), vagaDF(), vagaDF()]
  });
  const r = await rodar([c]);
  assert.deepStrictEqual(c.consultas, ["geral", "df"]);
  assert.strictEqual(r.segundaBusca, true);
  assert.strictEqual(r.cotaAtingida, true);
  assert.ok(r.emDF >= Math.ceil(r.lote.length / 2));
});

test("RD18: cota não atingida mesmo após a segunda busca: entrega o que achou, sem vaga de outra cidade", async () => {
  const c = conectorFalso("A", {
    geral: [vagaDF(), vagaRemota(), vagaRemota(), vagaRemota(), vagaDF({ rotulos: ["Híbrido", "São Paulo - SP"] })],
    df: []
  });
  const r = await rodar([c]);
  assert.deepStrictEqual(c.consultas, ["geral", "df"]); // exatamente uma segunda busca
  assert.strictEqual(r.lote.length, 4);
  assert.strictEqual(r.percentualDF, 25);
  assert.strictEqual(r.cotaAtingida, false);
  assert.ok(r.lote.every((a) => a.ehVagaDF || a.modalidade === "remoto"));
  assert.strictEqual(r.descartes.filter((d) => d.motivo === "local").length, 1);
});

test("cota atingida na primeira busca não faz segunda busca", async () => {
  const c = conectorFalso("A", { geral: [vagaDF(), vagaDF(), vagaRemota(), vagaRemota()] });
  const r = await rodar([c]);
  assert.deepStrictEqual(c.consultas, ["geral"]);
  assert.strictEqual(r.segundaBusca, false);
});

test("RD3: um Conector que falha não derruba os outros e a falha é reportada", async () => {
  const quebrado = conectorFalso("Quebrado", { falha: true });
  const bom = conectorFalso("Bom", { geral: [vagaDF(), vagaRemota()] });
  const r = await rodar([quebrado, bom]);
  assert.strictEqual(r.lote.length, 2);
  assert.strictEqual(r.falhas.length, 1);
  assert.deepStrictEqual([r.falhas[0].conector, r.falhas[0].foco], ["Quebrado", "geral"]);
  assert.match(r.falhas[0].erro, /500/);
});

test("RD3: todos os Conectores falhando entrega lote vazio e não inventa vagas", async () => {
  const r = await rodar([conectorFalso("A", { falha: true })]);
  assert.strictEqual(r.lote.length, 0);
  assert.strictEqual(r.falhas.length, 2); // geral e a segunda busca
});

test("RD4: URL já na planilha e repetida no lote viram Descarte 'duplicada' (e a segunda busca não repete)", async () => {
  const repetida = vagaRemota();
  const jaNaPlanilha = vagaRemota({ url: "https://vagas.exemplo/velha/9?utm_source=x" });
  const c = conectorFalso("A", { geral: [repetida, { ...repetida }, jaNaPlanilha], df: [{ ...repetida }] });
  const entradas = [];
  const r = await rodar([c], {
    urlsExistentes: new Set(["https://vagas.exemplo/velha/9"]),
    registrar: (tipo, e) => entradas.push([tipo, e])
  });
  assert.strictEqual(r.lote.length, 1);
  assert.strictEqual(r.descartes.filter((d) => d.motivo === "duplicada").length, 2);
  assert.strictEqual(entradas.filter(([t, e]) => t === "descartes" && e.motivo === "duplicada").length, 2);
});

test("Descartes e Pistas são registrados com motivo, sem a descrição da vaga", async () => {
  const c = conectorFalso("A", {
    geral: [
      vagaRemota({ descricao: "Pague a taxa de inscrição" }),
      vagaRemota({ publicadaEm: undefined }),
      vagaRemota()
    ]
  });
  const entradas = [];
  const r = await rodar([c], { registrar: (tipo, e) => entradas.push({ tipo, ...e }) });
  assert.strictEqual(r.lote.length, 1);
  assert.strictEqual(entradas.length, 2);
  assert.ok(entradas.every((e) => !("descricao" in e)));
  assert.ok(entradas.some((e) => e.tipo === "descartes" && e.motivo === "sinal de golpe"));
  assert.ok(entradas.some((e) => e.tipo === "pistas" && e.motivo === "sem data de publicação"));
});

test("RD20/RD23: o lote respeita MAX_VAGAS_LOTE", async () => {
  const c = conectorFalso("A", { geral: Array.from({ length: 12 }, (_, i) => (i % 2 ? vagaDF() : vagaRemota())) });
  const r = await rodar([c], { maxLote: 6 });
  assert.strictEqual(r.lote.length, 6);
  assert.ok(r.emDF >= 3);
});

// ---- Etapa: planilha falsa, --dry-run ----

function clienteFalso() {
  const escritas = [];
  return {
    escritas,
    async obterValores(_id, faixa) {
      if (/!A4:L4$/.test(faixa)) return [["Nº", "Vaga", "Link da vaga", "Empresa"]];
      return [["1", "Antiga", "https://vagas.exemplo/ja-existe"]];
    },
    async escreverValores(id, faixa, valores) { escritas.push({ id, faixa, valores }); }
  };
}

function montar(dryRun) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-"));
  const config = montarConfig({
    GOOGLE_SHEET_URL: "https://docs.google.com/spreadsheets/d/FICTICIA/edit",
    OUTPUT_DIR: path.join(dir, "output"),
    RADAR_STACK: "React"
  }, { dryRun });
  return config;
}

test("RD22: com --dry-run o Radar lê e classifica, mas não escreve na planilha; os logs continuam", async () => {
  const config = montar(true);
  const cliente = clienteFalso();
  const c = conectorFalso("A", {
    geral: [vagaDF({ descricao: "Usamos React." }), vagaRemota(), vagaRemota({ publicadaEm: undefined }), vagaRemota({ url: "https://vagas.exemplo/ja-existe" })]
  });
  const resultado = resultadoVazio();
  await criarEtapaRadar({ conectores: [c], clienteSheets: cliente, hoje: HOJE })({ config, resultado, logs });

  assert.strictEqual(cliente.escritas.length, 0);
  assert.strictEqual(resultado.gravadasNaPlanilha, 0);
  assert.strictEqual(resultado.encontradas, 2);
  assert.strictEqual(resultado.aprovadas.length, 2);
  assert.strictEqual(resultado.pistas.length, 1);
  assert.strictEqual(resultado.descartes.length, 1);
  assert.strictEqual(logs.ler(config.pastas.logs, "pistas").length, 1);
  assert.strictEqual(logs.ler(config.pastas.logs, "descartes").length, 1);
});

test("sem --dry-run grava o lote na planilha como 'Se candidatar', com a origem do Conector", async () => {
  const config = montar(false);
  const cliente = clienteFalso();
  const c = conectorFalso("GitHub (org/vagas)", { geral: [vagaDF(), vagaRemota()] });
  const resultado = resultadoVazio();
  await criarEtapaRadar({ conectores: [c], clienteSheets: cliente, hoje: HOJE })({ config, resultado, logs });

  assert.strictEqual(resultado.gravadasNaPlanilha, 2);
  assert.strictEqual(cliente.escritas.length, 2);
  const linhas = cliente.escritas.flatMap((e) => e.valores);
  assert.ok(linhas.every((l) => l[4] === "Busca automática - GitHub (org/vagas)"));
  assert.ok(linhas.every((l) => l[8] === "Se candidatar"));
  assert.ok(linhas.some((l) => /Brasília\/DF/.test(l[11])));
});

test("Alerta de Formação vai para a coluna L e para o resumo", async () => {
  const config = montar(false);
  const cliente = clienteFalso();
  const c = conectorFalso("A", { geral: [vagaRemota({ descricao: "Requisito: bacharelado em computação." })] });
  const resultado = resultadoVazio();
  await criarEtapaRadar({ conectores: [c], clienteSheets: cliente, hoje: HOJE })({ config, resultado, logs });
  assert.match(cliente.escritas[0].valores[0][11], /Bacharelado/);
  assert.strictEqual(resultado.alertasFormacao.length, 1);
});

// ---- Conector do GitHub ----

function fetchFalso(respostas) {
  const chamadas = [];
  return {
    chamadas,
    fetchImpl: async (url, init) => {
      chamadas.push({ url, init });
      const r = respostas.shift();
      return { ok: r.ok !== false, status: r.status || 200, json: async () => r.corpo };
    }
  };
}

test("GitHub: um Conector por repositório; issues viram Vagas Brutas, pull requests e fora são ignorados", async () => {
  const { chamadas, fetchImpl } = fetchFalso([{
    corpo: [
      { title: "Dev Júnior React", html_url: "https://github.com/org/vagas/issues/1", body: "Remoto", labels: [{ name: "Júnior" }, "Remoto"], created_at: RECENTE, state: "open" },
      { title: "PR qualquer", html_url: "https://github.com/org/vagas/pull/2", pull_request: {}, labels: [], created_at: RECENTE },
      { title: "Fechada", html_url: "https://github.com/org/vagas/issues/3", labels: [], created_at: RECENTE, state: "closed" }
    ]
  }]);
  const conectores = criarConectoresGithub({ repos: ["org/vagas", "org/outro"], token: "TOKEN-FALSO", fetchImpl, agora: () => HOJE });
  assert.deepStrictEqual(conectores.map((c) => c.nome), ["GitHub (org/vagas)", "GitHub (org/outro)"]);

  const vagas = await conectores[0].buscar({ foco: "geral" });
  assert.strictEqual(vagas.length, 2);
  assert.deepStrictEqual(vagas[0].rotulos, ["Júnior", "Remoto"]);
  assert.strictEqual(vagas[0].url, "https://github.com/org/vagas/issues/1");
  assert.strictEqual(vagas[0].publicadaEm, RECENTE);
  assert.strictEqual(vagas[1].encerrada, true);
  assert.match(chamadas[0].url, /repos\/org\/vagas\/issues\?state=open/);
  assert.strictEqual(chamadas[0].init.headers.Authorization, "Bearer TOKEN-FALSO");
});

test("GitHub: a busca focada no DF usa a Search API com Brasília", async () => {
  const { chamadas, fetchImpl } = fetchFalso([{ corpo: { items: [{ title: "Dev Jr", html_url: "https://github.com/org/vagas/issues/9", labels: [], created_at: RECENTE, state: "open" }] } }]);
  const [conector] = criarConectoresGithub({ repos: ["org/vagas"], fetchImpl });
  const vagas = await conector.buscar({ foco: "df" });
  assert.strictEqual(vagas.length, 1);
  assert.match(chamadas[0].url, /search\/issues/);
  assert.match(decodeURIComponent(chamadas[0].url), /Brasília/);
  assert.ok(!("Authorization" in chamadas[0].init.headers));
});

test("GitHub: erro 403 sugere GITHUB_TOKEN", async () => {
  const { fetchImpl } = fetchFalso([{ ok: false, status: 403 }]);
  const [conector] = criarConectoresGithub({ repos: ["org/vagas"], fetchImpl });
  await assert.rejects(conector.buscar({ foco: "geral" }), /403.*GITHUB_TOKEN/);
});
