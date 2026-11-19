// Testes do Contexto Pipeline de Candidatura: configuração e segurança do envio.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { lerAutoSubmit, extrairIdGoogle, montarConfig, validar, lerArquivoEnv } = require("../../pipeline/config");

test("AUTO_SUBMIT é false quando não definido", () => {
  assert.strictEqual(lerAutoSubmit(undefined), false);
  assert.strictEqual(lerAutoSubmit(""), false);
  assert.strictEqual(montarConfig({}).enviarCandidatura, false);
});

test("AUTO_SUBMIT só aceita true ou false", () => {
  assert.strictEqual(lerAutoSubmit("true"), true);
  assert.throws(() => lerAutoSubmit("TRUE"), /AUTO_SUBMIT/);
  assert.throws(() => lerAutoSubmit("sim"), /AUTO_SUBMIT/);
});

test("--dry-run vence AUTO_SUBMIT=true: não envia e não escreve na planilha", () => {
  const config = montarConfig({ AUTO_SUBMIT: "true" }, { dryRun: true });
  assert.strictEqual(config.enviarCandidatura, false);
  assert.strictEqual(config.escreverPlanilha, false);
});

test("AUTO_SUBMIT=true sem dry-run envia e escreve", () => {
  const config = montarConfig({ AUTO_SUBMIT: "true" });
  assert.strictEqual(config.enviarCandidatura, true);
  assert.strictEqual(config.escreverPlanilha, true);
});

test("extrai o ID de URLs do Google", () => {
  assert.strictEqual(
    extrairIdGoogle("https://docs.google.com/spreadsheets/d/ABC-123_x/edit#gid=0"),
    "ABC-123_x"
  );
  assert.throws(() => extrairIdGoogle("https://exemplo.com/nada"), /ID/);
});

test("validar lista o que falta por etapa", () => {
  const config = montarConfig({});
  const erros = validar(config, {}, ["radar"]);
  assert.ok(erros.some((e) => e.includes("GOOGLE_SHEET_URL")));
  assert.ok(!erros.some((e) => e.includes("ANTHROPIC_API_KEY")));
  assert.ok(validar(config, {}, ["curriculo"]).some((e) => e.includes("ANTHROPIC_API_KEY")));
});

test("validar acusa arquivo de Service Account inexistente", () => {
  const env = { GOOGLE_SHEET_URL: "x", GOOGLE_SERVICE_ACCOUNT_FILE: "secrets/nao-existe.json" };
  const erros = validar(montarConfig(env), env, ["radar"]);
  assert.ok(erros.some((e) => e.includes("não existe")));
});

test("pastas de saída ficam dentro de output/ (ignorado pelo Git)", () => {
  const { pastas } = montarConfig({});
  for (const pasta of Object.values(pastas)) assert.ok(pasta.includes(`${path.sep}output`), pasta);
});

test("lerArquivoEnv ignora comentários e tira aspas", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "env-"));
  const arquivo = path.join(dir, ".env");
  fs.writeFileSync(arquivo, '# comentário\nA=1\nB="dois"\n\nC = tres\n');
  assert.deepStrictEqual(lerArquivoEnv(arquivo), { A: "1", B: "dois", C: "tres" });
  assert.deepStrictEqual(lerArquivoEnv(path.join(dir, "nao-existe")), {});
});

test("Dados Complementares ficam em secrets/ (ignorado pelo Git) por padrão", () => {
  const { dadosComplementares } = montarConfig({});
  assert.ok(dadosComplementares.endsWith(path.join("secrets", "dados-complementares.json")));
});
