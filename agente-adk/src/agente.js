// Agente Assistente de Candidatura portado para o Google ADK (LlmAgent + FunctionTool + Runner).
// O que o ADK entrega: laço de tool calling, sessão e eventos. O que continua nosso: prompt, ferramentas e guardrails.
const path = require("node:path");
const { LlmAgent, InMemoryRunner, isFinalResponse, stringifyContent } = require("@google/adk");
const { criarFerramentas } = require("../../pipeline/agente/ferramentas");
const { lerVagasLocais, lerPerfilLocal } = require("../../pipeline/agente/fontes");
const { SYSTEM_PROMPT } = require("../../pipeline/agente/prompt");
const { criarRag } = require("../../pipeline/rag");
const { criarFerramentasAdk } = require("./ferramentas");

const RAIZ = path.join(__dirname, "..", "..");
const MODELO_PADRAO = "gemini-3.5-flash";

/**
 * `model` aceita o nome de um modelo Gemini ou um BaseLlm (os testes passam um falso).
 * @param {{ model?: any, rag?: any, lerVagas?: () => any[], lerPerfil?: () => any, env?: Record<string, string | undefined> }} [opcoes]
 */
function criarAgenteAdk({ model, rag, lerVagas, lerPerfil, env = process.env } = {}) {
  const pastaSaida = path.join(RAIZ, "output");
  const base = criarFerramentas({
    rag: rag || criarRag({ raiz: RAIZ, pastaSaida, env }),
    lerVagas: lerVagas || (() => lerVagasLocais(pastaSaida)),
    lerPerfil: lerPerfil || (() => lerPerfilLocal(pastaSaida))
  });
  return new LlmAgent({
    name: "assistente_de_candidatura",
    model: model || env.GEMINI_MODEL || MODELO_PADRAO,
    description: "Ajuda a Candidata a avaliar vagas e a responder perguntas de formulário, só com fatos da Base de Conhecimento e do Perfil.",
    instruction: SYSTEM_PROMPT,
    tools: criarFerramentasAdk(base)
  });
}

/**
 * Executa uma pergunta e devolve as ferramentas acionadas e a resposta final.
 * @param {LlmAgent} agente @param {string} pergunta
 */
async function perguntar(agente, pergunta) {
  const runner = new InMemoryRunner({ agent: agente, appName: "preenche-vaga" });
  /** @type {string[]} */
  const ferramentas = [];
  let resposta = "";
  for await (const evento of runner.runEphemeral({ userId: "candidata", newMessage: { role: "user", parts: [{ text: pergunta }] } })) {
    for (const parte of evento.content?.parts || []) if (parte.functionCall?.name) ferramentas.push(parte.functionCall.name);
    if (isFinalResponse(evento)) resposta = stringifyContent(evento);
  }
  return { ferramentas, resposta };
}

module.exports = { criarAgenteAdk, perguntar };
