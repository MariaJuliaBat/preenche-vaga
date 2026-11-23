// Ponto de entrada do RAG: junta pastas, vetorizador, índice e busca.
const fs = require("node:fs");
const path = require("node:path");
const { indexar } = require("./indice");
const { buscar } = require("./buscar");
const { vetorizadorDoAmbiente } = require("./vetorizar");

/** R9: a base de exemplo (no Git) e, se existir, a pessoal (secrets/, fora do Git). @param {string} raiz */
function pastasPadrao(raiz) {
  return [
    { rotulo: "exemplo", caminho: path.join(raiz, "docs", "base-conhecimento-exemplo") },
    { rotulo: "pessoal", caminho: path.join(raiz, "secrets", "base-conhecimento") }
  ].filter((p) => fs.existsSync(p.caminho));
}

/**
 * @param {{ raiz: string, pastaSaida?: string, env?: Record<string, string | undefined>, vetorizador?: import("./vetorizar").Vetorizador, pastas?: { rotulo: string, caminho: string }[], tamanhoMax?: number, sobreposicao?: number }} args
 */
function criarRag({ raiz, pastaSaida = path.join(raiz, "output"), env = {}, vetorizador = vetorizadorDoAmbiente(env), pastas = pastasPadrao(raiz), tamanhoMax, sobreposicao }) {
  const caminhoIndice = path.join(pastaSaida, "rag-index.json");
  /** @type {import("./indice").Indice | null} */
  let indice = null;
  const rag = {
    modelo: vetorizador.modelo,
    async indexar() {
      const r = await indexar({ pastas, caminhoIndice, vetorizador, tamanhoMax, sobreposicao });
      indice = r.indice;
      return r;
    },
    /** @param {string} consulta @param {{ topK?: number }} [opcoes] */
    async buscar(consulta, opcoes) {
      if (!indice) await rag.indexar();
      return buscar(/** @type {import("./indice").Indice} */ (indice), consulta, vetorizador, opcoes);
    }
  };
  return rag;
}

module.exports = { criarRag, pastasPadrao };
