// RAG: Índice em disco (R3 a R6, R9). Um hash por arquivo: arquivo igual não é vetorizado de novo.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { fragmentar, PADRAO } = require("./fragmentar");

const VERSAO = 1;
const EXTENSOES = /\.(md|txt)$/i;

/**
 * @typedef {{ fonte: string, secao: string, texto: string, vetor: number[] }} TrechoIndexado
 * @typedef {{ versao: number, modelo: string, arquivos: Record<string, { hash: string, trechos: TrechoIndexado[] }> }} Indice
 */

/** @param {string} pasta @returns {string[]} caminhos relativos, ordenados */
function listarArquivos(pasta) {
  /** @type {string[]} */
  const achados = [];
  const andar = (/** @type {string} */ dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, e.name);
      if (e.isDirectory()) andar(caminho);
      else if (e.isFile() && EXTENSOES.test(e.name)) achados.push(path.relative(pasta, caminho).split(path.sep).join("/"));
    }
  };
  if (fs.existsSync(pasta)) andar(pasta);
  return achados.sort();
}

/** @param {string} caminho @param {string} modelo @returns {Indice} */
function lerIndice(caminho, modelo) {
  try {
    const i = JSON.parse(fs.readFileSync(caminho, "utf8"));
    if (i?.versao === VERSAO && i.modelo === modelo && i.arquivos && typeof i.arquivos === "object") return i; // R6: outro modelo = recomeça
  } catch { /* sem índice ou corrompido: recomeça */ }
  return { versao: VERSAO, modelo, arquivos: {} };
}

/**
 * @param {{
 *   pastas: { rotulo: string, caminho: string }[],
 *   caminhoIndice: string,
 *   vetorizador: import("./vetorizar").Vetorizador,
 *   tamanhoMax?: number, sobreposicao?: number
 * }} args
 */
async function indexar({ pastas, caminhoIndice, vetorizador, tamanhoMax = PADRAO.tamanhoMax, sobreposicao = PADRAO.sobreposicao }) {
  const anterior = lerIndice(caminhoIndice, vetorizador.modelo);
  /** @type {Indice} */
  const indice = { versao: VERSAO, modelo: vetorizador.modelo, arquivos: {} };
  /** @type {string[]} */
  const vetorizados = [];
  /** @type {string[]} */
  const reaproveitados = [];

  for (const { rotulo, caminho } of pastas) {
    for (const relativo of listarArquivos(caminho)) {
      const fonte = `${rotulo}/${relativo}`; // nunca caminho absoluto: não vaza nomes de pastas do computador
      const texto = fs.readFileSync(path.join(caminho, relativo), "utf8");
      const hash = crypto.createHash("sha256").update(`${tamanhoMax}|${sobreposicao}|${texto}`).digest("hex");
      if (anterior.arquivos[fonte]?.hash === hash) { // R4
        indice.arquivos[fonte] = anterior.arquivos[fonte];
        reaproveitados.push(fonte);
        continue;
      }
      const trechos = fragmentar(texto, { fonte, tamanhoMax, sobreposicao });
      const vetores = trechos.length ? await vetorizador.vetorizar(trechos.map((t) => `${t.secao}\n${t.texto}`.trim()), "documento") : [];
      indice.arquivos[fonte] = { hash, trechos: trechos.map((t, i) => ({ ...t, vetor: vetores[i] })) };
      vetorizados.push(fonte);
    }
  }

  const removidos = Object.keys(anterior.arquivos).filter((f) => !(f in indice.arquivos)); // R5
  if (vetorizados.length || removidos.length || !fs.existsSync(caminhoIndice)) {
    fs.mkdirSync(path.dirname(caminhoIndice), { recursive: true });
    fs.writeFileSync(caminhoIndice, JSON.stringify(indice), "utf8");
  }
  return { indice, vetorizados, reaproveitados, removidos };
}

module.exports = { indexar, listarArquivos, lerIndice };
