// RAG, passo 2: Embedding (R3, R6). Dois vetorizadores com a mesma interface:
//  - Gemini: API de embeddings (precisa de GEMINI_API_KEY);
//  - local-hash: determinístico, offline, usado nos testes e sem chave (não entende sinônimos, só palavras em comum).
const { normalizar } = require("../radar/texto");
const { detalheDoErro } = require("../agente/gemini");

const URL_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODELO_GEMINI = "gemini-embedding-001";
const MODELO_LOCAL = "local-hash";
const DIMENSAO_LOCAL = 1024;
const LOTE = 100; // limite da API em batchEmbedContents

/**
 * @typedef {object} Vetorizador
 * @property {string} modelo
 * @property {(textos: string[], tipo?: "documento" | "consulta") => Promise<number[][]>} vetorizar
 */

/** Hash FNV-1a de 32 bits. @param {string} s */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Normaliza para comprimento 1 (cosseno vira produto escalar). @param {number[]} v */
function unitario(v) {
  const norma = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norma === 0 ? v : v.map((x) => x / norma);
}

/** @param {string} texto */
function vetorLocal(texto) {
  const v = new Array(DIMENSAO_LOCAL).fill(0);
  for (const palavra of normalizar(texto).match(/[a-z0-9#+.]{2,}/g) || []) {
    const h = fnv1a(palavra);
    v[h % DIMENSAO_LOCAL] += 1;
  }
  return unitario(v);
}

/** @returns {Vetorizador} */
function criarVetorizadorLocal() {
  return { modelo: MODELO_LOCAL, vetorizar: async (textos) => textos.map(vetorLocal) };
}

/**
 * @param {{ apiKey: string, modelo?: string, fetchImpl?: typeof fetch }} args
 * @returns {Vetorizador}
 */
function criarVetorizadorGemini({ apiKey, modelo = MODELO_GEMINI, fetchImpl = fetch }) {
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente.");
  return {
    modelo,
    async vetorizar(textos, tipo = "documento") {
      /** @type {number[][]} */
      const saida = [];
      for (let i = 0; i < textos.length; i += LOTE) {
        const requests = textos.slice(i, i + LOTE).map((texto) => ({
          model: `models/${modelo}`,
          content: { parts: [{ text: texto }] },
          taskType: tipo === "consulta" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT"
        }));
        const resposta = await fetchImpl(`${URL_BASE}/models/${modelo}:batchEmbedContents`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ requests })
        });
        if (!resposta.ok) {
          const detalhe = await detalheDoErro(resposta, apiKey); // só error.message, sem a chave
          throw new Error(`Embeddings do Gemini falharam (HTTP ${resposta.status})${detalhe ? `: ${detalhe}` : ""}.`);
        }
        const corpo = /** @type {any} */ (await resposta.json());
        const valores = (corpo.embeddings || []).map((/** @type {any} */ e) => e.values);
        if (valores.length !== requests.length || valores.some((/** @type {any} */ x) => !Array.isArray(x))) throw new Error("Resposta de embeddings inesperada.");
        saida.push(...valores.map(unitario));
      }
      return saida;
    }
  };
}

/** Gemini se houver chave; senão o local (R6). @param {Record<string, string | undefined>} env @param {typeof fetch} [fetchImpl] */
function vetorizadorDoAmbiente(env, fetchImpl) {
  return env.GEMINI_API_KEY ? criarVetorizadorGemini({ apiKey: env.GEMINI_API_KEY, modelo: env.GEMINI_EMBEDDING_MODEL || undefined, fetchImpl }) : criarVetorizadorLocal();
}

module.exports = { criarVetorizadorLocal, criarVetorizadorGemini, vetorizadorDoAmbiente, vetorLocal, MODELO_LOCAL, MODELO_GEMINI };
