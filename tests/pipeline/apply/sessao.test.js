// Etapa 2 do Auto-Apply: Sessão persistente e Login Assistido (A1 a A6). Navegador falso: nada abre de verdade.
const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const { loginAssistido, portalDaUrl, PORTAIS } = require("../../../pipeline/apply/sessao");

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
