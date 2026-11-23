// Teste do porte ADK (P1, P2): LLM falso (BaseLlm), RAG e vagas fictícios. Sem chave, sem rede.
const test = require("node:test");
const assert = require("node:assert");
const { BaseLlm } = require("@google/adk");
const { criarAgenteAdk, perguntar } = require("../src/agente");
const { criarFerramentasAdk } = require("../src/ferramentas");

const VAGAS = [{ titulo: "Estágio em Node.js", empresa: "Empresa Alfa", url: "https://exemplo.test/1", ehVagaDF: true, pontos: 9, descricao: "Node.js e Docker." }];
const rag = { buscar: async () => [{ score: 0.9, fonte: "exemplo/projetos.md", secao: "Robô", texto: "Automação em Node.js com Playwright." }] };

/** LLM falso: 1ª chamada pede as duas ferramentas; 2ª responde com o que elas devolveram. */
class LlmFalso extends BaseLlm {
  constructor() {
    super({ model: "llm-falso" });
    /** @type {any[]} */
    this.pedidos = [];
  }

  async *generateContentAsync(/** @type {any} */ requisicao) {
    this.pedidos.push(requisicao);
    const jaTemResposta = requisicao.contents.some((/** @type {any} */ c) => c.parts?.some((/** @type {any} */ p) => p.functionResponse));
    if (!jaTemResposta) {
      yield { content: { role: "model", parts: [
        { functionCall: { name: "consultar_base_pessoal", args: { consulta: "automação" } } },
        { functionCall: { name: "consultar_vagas_planilha", args: { filtro: "node" } } }
      ] } };
    } else {
      const devolvido = requisicao.contents.flatMap((/** @type {any} */ c) => c.parts || []).filter((/** @type {any} */ p) => p.functionResponse).map((/** @type {any} */ p) => p.functionResponse.response);
      yield { content: { role: "model", parts: [{ text: `Resumo: ${JSON.stringify(devolvido)}` }] } };
    }
  }
}

test("P1: o porte declara as ferramentas ligadas ao RAG e às vagas", () => {
  const nomes = criarFerramentasAdk({ executar: async () => ({ resultado: {} }) }).map((t) => t.name);
  assert.ok(nomes.includes("consultar_base_pessoal"));
  assert.ok(nomes.includes("consultar_vagas_planilha"));
  assert.ok(nomes.length >= 2);
});

test("P1/P2: o agente ADK chama as duas ferramentas e a resposta traz dados do RAG e das vagas", async () => {
  const llm = new LlmFalso();
  const agente = criarAgenteAdk({ model: llm, rag, lerVagas: () => VAGAS, lerPerfil: () => null, env: {} });
  const { ferramentas, resposta } = await perguntar(agente, "O que já fiz com automação e que vagas Node existem?");

  assert.deepStrictEqual([...ferramentas].sort(), ["consultar_base_pessoal", "consultar_vagas_planilha"]);
  assert.match(resposta, /Playwright/);   // veio do RAG
  assert.match(resposta, /Empresa Alfa/); // veio das vagas
  assert.ok(!/Docker/.test(resposta), "a listagem de vagas não devolve a descrição");
  assert.match(JSON.stringify(llm.pedidos[0]), /Nunca invente/); // o mesmo System Prompt do agente original
});

test("P2: ferramenta com argumento inválido devolve erro ao modelo, sem derrubar o agente", async () => {
  const llm = new LlmFalso();
  llm.generateContentAsync = async function* (/** @type {any} */ req) {
    const respondeu = req.contents.some((/** @type {any} */ c) => c.parts?.some((/** @type {any} */ p) => p.functionResponse));
    yield { content: { role: "model", parts: respondeu
      ? [{ text: "fim" }]
      : [{ functionCall: { name: "consultar_base_pessoal", args: { consulta: "" } } }] } };
  };
  const agente = criarAgenteAdk({ model: llm, rag, lerVagas: () => VAGAS, lerPerfil: () => null, env: {} });
  const { resposta } = await perguntar(agente, "teste");
  assert.strictEqual(resposta, "fim");
});
