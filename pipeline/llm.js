// Cliente do LLM (Anthropic). Regras do Pipeline (P13, PF8): o modelo NÃO tem ferramentas; só recebe texto
// delimitado e devolve JSON validado por schema Zod. Recusa ou resposta fora do schema viram erro claro.
const MODELO_PADRAO = "claude-opus-5-5";

/**
 * @typedef {object} Llm
 * @property {string} modelo
 * @property {<T>(args: { sistema: string, usuario: string, schema: import("zod").ZodType<T>, maxTokens?: number }) => Promise<T>} json
 */

/**
 * @param {{ apiKey: string, modelo?: string, cliente?: any }} opcoes `cliente` permite injetar um falso nos testes
 * @returns {Llm}
 */
function criarLlm(opcoes) {
  const modelo = opcoes.modelo || MODELO_PADRAO;
  let cliente = opcoes.cliente;

  return {
    modelo,
    async json({ sistema, usuario, schema, maxTokens = 16000 }) {
      if (!cliente) {
        const Anthropic = require("@anthropic-ai/sdk");
        cliente = new (Anthropic.default || Anthropic)({ apiKey: opcoes.apiKey });
      }
      const { zodOutputFormat } = require("@anthropic-ai/sdk/helpers/zod");
      const resposta = await cliente.beta.messages.parse({
        model: modelo,
        max_tokens: maxTokens,
        system: sistema,
        messages: [{ role: "user", content: usuario }],
        // Uma recusa dos classificadores reexecuta a chamada em outro modelo, no servidor.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: zodOutputFormat(schema) }
      });

      if (resposta.stop_reason === "refusal") {
        throw new Error(`O modelo recusou a solicitação (${resposta.stop_details?.category || "sem categoria"}).`);
      }
      if (resposta.stop_reason === "max_tokens") {
        throw new Error("A resposta do modelo foi cortada por limite de tokens.");
      }
      if (resposta.parsed_output == null) {
        throw new Error("A resposta do modelo não seguiu o schema esperado.");
      }
      return resposta.parsed_output;
    }
  };
}

module.exports = { criarLlm, MODELO_PADRAO };
