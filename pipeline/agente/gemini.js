// Cliente mínimo da API REST do Gemini (sem SDK: cada chamada fica à vista). Só `fetch`, injetável nos testes.
// A chave vai no cabeçalho x-goog-api-key, nunca na URL, e nunca aparece em mensagem de erro.
const URL_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODELO_PADRAO = "gemini-3.5-flash"; // gemini-2.5-flash deu 404 em contas novas; troque com GEMINI_MODEL (ex.: gemini-3.8-flash)

/**
 * Motivo real do erro da API (campo error.message do JSON), sem eco da chave.
 * @param {any} resposta
 * @param {string} chave
 */
async function detalheDoErro(resposta, chave = "") {
  try {
    const corpo = /** @type {any} */ (await resposta.json());
    let msg = String(corpo?.error?.message || "").trim();
    if (chave) msg = msg.split(chave).join("[chave]");
    return msg.slice(0, 300);
  } catch {
    return "";
  }
}

/**
 * Lê um corpo `text/event-stream` e devolve cada objeto JSON dos eventos `data:`.
 * @param {AsyncIterable<string | Uint8Array>} corpo
 * @returns {AsyncGenerator<any>}
 */
async function* lerSse(corpo) {
  const decodificador = new TextDecoder();
  let resto = "";
  for await (const pedaco of corpo) {
    resto += typeof pedaco === "string" ? pedaco : decodificador.decode(pedaco, { stream: true });
    resto = resto.replace(/\r\n/g, "\n");
    let fim;
    while ((fim = resto.indexOf("\n\n")) !== -1) {
      const evento = resto.slice(0, fim);
      resto = resto.slice(fim + 2);
      const dados = evento.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (dados && dados !== "[DONE]") yield JSON.parse(dados);
    }
  }
}

/**
 * @typedef {object} PedidoGemini
 * @property {string} systemInstruction
 * @property {any[]} contents
 * @property {any[]} [tools] declarações de função
 * @property {object} [responseSchema] força JSON no formato dado (Structured Output)
 */

/** @param {{ apiKey: string, modelo?: string, fetchImpl?: typeof fetch }} args */
function criarClienteGemini({ apiKey, modelo = MODELO_PADRAO, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente: coloque a chave no .env (veja .env.example).");

  /** @param {PedidoGemini} p */
  const corpoDoPedido = (p) => ({
    systemInstruction: { parts: [{ text: p.systemInstruction }] },
    contents: p.contents,
    ...(p.tools?.length ? { tools: [{ functionDeclarations: p.tools }] } : {}),
    generationConfig: { temperature: 0.2, ...(p.responseSchema ? { responseMimeType: "application/json", responseSchema: p.responseSchema } : {}) }
  });

  /** @param {string} metodo @param {PedidoGemini} pedido */
  async function chamar(metodo, pedido) {
    const resposta = await fetchImpl(`${URL_BASE}/models/${modelo}:${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(corpoDoPedido(pedido))
    });
    if (!resposta.ok) {
      const detalhe = await detalheDoErro(resposta, apiKey);
      throw new Error(`O Gemini recusou o pedido (HTTP ${resposta.status})${detalhe ? `: ${detalhe}` : ""}.`);
    }
    return resposta;
  }

  return {
    modelo,
    /** Resposta inteira (usada no Structured Output). @param {PedidoGemini} pedido */
    async gerar(pedido) {
      const corpo = /** @type {any} */ (await (await chamar("generateContent", pedido)).json());
      return (corpo.candidates?.[0]?.content?.parts || []).map((/** @type {any} */ p) => p.text || "").join("");
    },
    /** Streaming: devolve cada pedaço (chunk) como o Gemini manda. @param {PedidoGemini} pedido */
    async *transmitir(pedido) {
      const resposta = await chamar("streamGenerateContent?alt=sse", pedido);
      yield* lerSse(/** @type {any} */ (resposta.body));
    }
  };
}

module.exports = { criarClienteGemini, detalheDoErro, lerSse, MODELO_PADRAO };
