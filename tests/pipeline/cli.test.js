const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { executar, lerArgumentos } = require("../../pipeline/cli");
const logs = require("../../pipeline/logs");
const { formatarResumo, resultadoVazio } = require("../../pipeline/resumo");

test("sem opções roda as três etapas", () => {
  assert.deepStrictEqual(lerArgumentos([]).etapas, ["radar", "curriculo", "candidatura"]);
});

test("--only-radar e --dry-run", () => {
  const args = lerArgumentos(["--only-radar", "--dry-run"]);
  assert.deepStrictEqual(args.etapas, ["radar"]);
  assert.strictEqual(args.dryRun, true);
});

test("duas opções --only-* juntas são recusadas", () => {
  assert.throws(() => lerArgumentos(["--only-radar", "--only-cv"]), /só uma/);
});

test("opção desconhecida dá erro e código 1", async () => {
  const saidas = [];
  assert.strictEqual(await executar(["--enviar-tudo"], { env: {}, saida: (t) => saidas.push(t) }), 1);
  assert.match(saidas.join(""), /Erro/);
});

test("--help imprime a ajuda e sai com 0 sem exigir .env", async () => {
  const saidas = [];
  assert.strictEqual(await executar(["--help"], { env: {}, saida: (t) => saidas.push(t) }), 0);
  assert.match(saidas.join(""), /AUTO_SUBMIT=false é o padrão/);
});

test("sem configuração, avisa o que falta e sai com 1", async () => {
  const saidas = [];
  assert.strictEqual(await executar(["--only-radar"], { env: {}, saida: (t) => saidas.push(t) }), 1);
  assert.match(saidas.join(""), /GOOGLE_SHEET_URL/);
});

test("execução com config válida imprime o resumo e os logs de pistas", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saida-"));
  const conta = path.join(dir, "conta.json");
  fs.writeFileSync(conta, "{}"); // arquivo fictício, só para existir
  const env = {
    GOOGLE_SHEET_URL: "https://docs.google.com/spreadsheets/d/FICTICIA/edit",
    GOOGLE_SERVICE_ACCOUNT_FILE: conta,
    OUTPUT_DIR: path.join(dir, "output")
  };
  logs.registrar(path.join(dir, "output", "logs"), "pistas", { titulo: "Dev Jr Fictícia", motivo: "sem link individual" });

  const saidas = [];
  const codigo = await executar(["--only-radar", "--dry-run"], { env, saida: (t) => saidas.push(t) });
  const texto = saidas.join("\n");
  assert.strictEqual(codigo, 0);
  assert.match(texto, /dry-run/);
  assert.match(texto, /Pistas para revisão manual: 1/);
  assert.match(texto, /Dev Jr Fictícia/);
  assert.match(texto, /Etapa ainda não implementada: radar/);
});

test("resumo calcula % de Brasília e alerta abaixo de 50%", () => {
  const r = { ...resultadoVazio(), encontradas: 4, emBrasilia: 1, remotas: 3 };
  const texto = formatarResumo(r, { dryRun: false, enviarCandidatura: false });
  assert.match(texto, /Brasília - DF \(presencial\/híbrida\): 1 \(25%\)/);
  assert.match(texto, /menos de 50%/);
});
