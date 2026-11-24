// Etapa 2 do Auto-Apply: Sessão persistente e Login Assistido (A1 a A6). Navegador falso: nada abre de verdade.
const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const { loginAssistido, portalDaUrl, abrirContextoPersistente, acharBrave, PORTAIS } = require("../../../pipeline/apply/sessao");

const CONFIG = { pastas: { sessaoNavegador: "C:/fake/output/sessao-navegador" } };

function navegadorFalso() {
  const contexto = new EventEmitter();
  const visitadas = [];
  const pagina = { goto: async (url) => { visitadas.push(url); } };
  contexto.pages = () => [pagina];
  contexto.newPage = async () => pagina;
  const aberturas = [];
  const abrir = async (opcoes) => { aberturas.push(opcoes); setImmediate(() => contexto.emit("close")); return contexto; };
  return { abrir, aberturas, visitadas };
}

test("A1/A3: --login abre VISÍVEL na pasta da Sessão e vai para a página de login do Portal", async () => {
  const f = navegadorFalso();
  const saidas = [];
  await loginAssistido({ config: CONFIG, portal: "gupy", saida: (t) => saidas.push(t), abrir: f.abrir });
  assert.deepStrictEqual(f.aberturas, [{ pasta: CONFIG.pastas.sessaoNavegador, visivel: true }]);
  assert.deepStrictEqual(f.visitadas, [PORTAIS.gupy.login]);
  assert.match(saidas.join("\n"), /FECHE a janela/);
  assert.match(saidas.join("\n"), /Sessão salva/);
});

test("--login sem portal abre em branco (nenhuma navegação)", async () => {
  const f = navegadorFalso();
  await loginAssistido({ config: CONFIG, saida: () => {}, abrir: f.abrir });
  assert.strictEqual(f.aberturas.length, 1);
  assert.deepStrictEqual(f.visitadas, []);
});

test("portal desconhecido (inclusive LinkedIn, fora da automação) é recusado antes de abrir o navegador", async () => {
  const f = navegadorFalso();
  for (const portal of ["linkedin", "programathor", "qualquer"]) {
    await assert.rejects(() => loginAssistido({ config: CONFIG, portal, saida: () => {}, abrir: f.abrir }), /Portal desconhecido/);
  }
  assert.strictEqual(f.aberturas.length, 0);
});

test("A2: só Gupy, Indeed e InfoJobs têm login assistido (Trampos saiu, LinkedIn nunca entrou); nenhum Portal guarda credencial", () => {
  assert.deepStrictEqual(Object.keys(PORTAIS).sort(), ["gupy", "indeed", "infojobs"]);
  for (const p of Object.values(PORTAIS)) assert.deepStrictEqual(Object.keys(p).sort(), ["dominios", "login", "nome"]);
});

test("portalDaUrl: Gupy, Indeed e InfoJobs pelo domínio; o resto é formulário web padrão; domínio parecido não engana", () => {
  assert.strictEqual(portalDaUrl("https://empresa.gupy.io/jobs/123"), "gupy");
  assert.strictEqual(portalDaUrl("https://br.indeed.com/viewjob?jk=abc"), "indeed");
  assert.strictEqual(portalDaUrl("https://www.infojobs.com.br/vaga-de-x__123.aspx"), "infojobs");
  assert.strictEqual(portalDaUrl("https://trampos.co/oportunidades/1"), null); // Trampos saiu da lista
  assert.strictEqual(portalDaUrl("https://forms.exemplo.com/vaga"), null);
  assert.strictEqual(portalDaUrl("https://gupy.io.malicioso.com/x"), null);
  assert.strictEqual(portalDaUrl("não é url"), null);
});

test("o login de cada Portal fica no domínio do próprio Portal", () => {
  for (const [chave, p] of Object.entries(PORTAIS)) assert.strictEqual(portalDaUrl(p.login), chave);
  assert.strictEqual(PORTAIS.infojobs.login, "https://login.infojobs.com.br/Candidate");
});

test("login da Gupy abre portal.gupy.io", () => {
  assert.strictEqual(PORTAIS.gupy.login, "https://portal.gupy.io");
});

test("navegador real: tenta Edge, cai para Chrome, sem --no-sandbox e sem --enable-automation", async () => {
  const chamadas = [];
  const chromium = { launchPersistentContext: async (pasta, o) => {
    chamadas.push(o);
    if (o.channel === "msedge") throw new Error("Executable doesn't exist");
    return "ctx";
  } };
  const pasta = require("node:os").tmpdir() + "/sessao-teste-nav";
  const ctx = await abrirContextoPersistente({ pasta, visivel: true, env: {}, chromium, existe: () => false });
  assert.strictEqual(ctx, "ctx");
  assert.deepStrictEqual(chamadas.map((c) => c.channel), ["msedge", "chrome"]);
  for (const c of chamadas) {
    assert.deepStrictEqual(c.ignoreDefaultArgs, ["--enable-automation"]);
    assert.ok(!(c.args || []).includes("--no-sandbox"));
  }
});

const OUTRO_BRAVE = String.raw`D:\Brave\brave.exe`;
const CAMINHO_RUIM = String.raw`D:\X\brave.exe`;
const BRAVE_PF = String.raw`C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe`;
const BRAVE_LOCAL = String.raw`C:\Users\ana\AppData\Local\BraveSoftware\Brave-Browser\Application\brave.exe`;
const ENV_WIN = { ProgramFiles: String.raw`C:\Program Files`, LOCALAPPDATA: String.raw`C:\Users\ana\AppData\Local` };

test("acharBrave: Program Files, depois %LOCALAPPDATA%; fora do Windows ou sem Brave não acha", () => {
  assert.strictEqual(acharBrave(ENV_WIN, (c) => c === BRAVE_PF, "win32"), BRAVE_PF);
  assert.strictEqual(acharBrave(ENV_WIN, (c) => c === BRAVE_LOCAL, "win32"), BRAVE_LOCAL);
  assert.strictEqual(acharBrave(ENV_WIN, () => true, "win32"), BRAVE_PF); // os dois existem: vale o primeiro
  assert.strictEqual(acharBrave(ENV_WIN, () => false, "win32"), null);
  assert.strictEqual(acharBrave(ENV_WIN, () => true, "linux"), null);
});

/** Chromium falso: guarda as opções de cada tentativa; `falham` lista o que "não está instalado". */
function chromiumFalso(falham = []) {
  const tentativas = [];
  return {
    tentativas,
    launchPersistentContext: async (_pasta, o) => {
      tentativas.push(o);
      const id = o.executablePath || o.channel;
      if (falham.includes(id)) throw new Error("Executable doesn't exist");
      return "ctx";
    }
  };
}
const pastaTeste = () => require("node:os").tmpdir() + "/sessao-teste-brave";

test("navegador: executavel do .env tem prioridade e é a única tentativa", async () => {
  const chromium = chromiumFalso();
  await abrirContextoPersistente({ pasta: pastaTeste(), visivel: true, executavel: OUTRO_BRAVE, env: ENV_WIN, chromium, existe: () => true, plataforma: "win32" });
  assert.deepStrictEqual(chromium.tentativas.map((t) => t.executablePath), [OUTRO_BRAVE]);
  assert.strictEqual(chromium.tentativas[0].channel, undefined);
});

test("navegador: BROWSER_EXECUTABLE_PATH em process.env também vale; caminho inexistente dá erro claro, sem cair para outro", async () => {
  const chromium = chromiumFalso([CAMINHO_RUIM]);
  await assert.rejects(
    () => abrirContextoPersistente({ pasta: pastaTeste(), visivel: true, env: { BROWSER_EXECUTABLE_PATH: CAMINHO_RUIM }, chromium }),
    /BROWSER_EXECUTABLE_PATH/
  );
  assert.strictEqual(chromium.tentativas.length, 1);
});

test("navegador: sem caminho no .env, usa o Brave instalado antes de Edge e Chrome; se o Brave falha, cai para Edge", async () => {
  const chromium = chromiumFalso([BRAVE_PF]);
  const ctx = await abrirContextoPersistente({ pasta: pastaTeste(), visivel: true, env: ENV_WIN, chromium, existe: (c) => c === BRAVE_PF, plataforma: "win32" });
  assert.strictEqual(ctx, "ctx");
  assert.deepStrictEqual(chromium.tentativas.map((t) => t.executablePath || t.channel), [BRAVE_PF, "msedge"]);
});

test("navegador: sem Brave instalado, tenta Edge e depois Chrome; opções sem --no-sandbox e sem --enable-automation", async () => {
  const chromium = chromiumFalso(["msedge"]);
  await abrirContextoPersistente({ pasta: pastaTeste(), visivel: true, env: ENV_WIN, chromium, existe: () => false, plataforma: "win32" });
  assert.deepStrictEqual(chromium.tentativas.map((t) => t.executablePath || t.channel), ["msedge", "chrome"]);
  for (const t of chromium.tentativas) {
    assert.deepStrictEqual(t.ignoreDefaultArgs, ["--enable-automation"]);
    assert.ok(!(t.args || []).includes("--no-sandbox"));
  }
});

test("loginAssistido repassa o executavel do config à abertura", async () => {
  const f = navegadorFalso();
  await loginAssistido({ config: { ...CONFIG, navegador: { executavel: OUTRO_BRAVE } }, saida: () => {}, abrir: f.abrir });
  assert.deepStrictEqual(f.aberturas, [{ pasta: CONFIG.pastas.sessaoNavegador, visivel: true, executavel: OUTRO_BRAVE }]);
});
