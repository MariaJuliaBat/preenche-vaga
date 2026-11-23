// RAG, passo 1: Chunking (R1, R2). Corta o texto por seção (título #) e depois por parágrafo,
// com tamanho máximo e sobreposição configuráveis. Sem rede, sem dependência.

const PADRAO = Object.freeze({ tamanhoMax: 800, sobreposicao: 100 });

/**
 * @typedef {object} Trecho
 * @property {string} fonte arquivo de origem
 * @property {string} secao título mais próximo ("" se não houver)
 * @property {string} texto
 */

/** Últimos `n` caracteres, começando numa palavra inteira. @param {string} texto @param {number} n */
function cauda(texto, n) {
  if (n <= 0) return "";
  if (texto.length <= n) return texto;
  const pedaco = texto.slice(texto.length - n);
  const espaco = pedaco.search(/\s/);
  return espaco === -1 ? pedaco : pedaco.slice(espaco).trim();
}

/** Parágrafo maior que o máximo vira janelas deslizantes. @param {string} texto @param {number} max @param {number} sobre */
function janelas(texto, max, sobre) {
  const partes = [];
  const passo = Math.max(1, max - sobre);
  for (let i = 0; i < texto.length; i += passo) {
    partes.push(texto.slice(i, i + max).trim());
    if (i + max >= texto.length) break;
  }
  return partes.filter(Boolean);
}

/** Divide em seções: cada linha que começa com # abre uma nova. @param {string} texto */
function secoes(texto) {
  /** @type {{ titulo: string, linhas: string[] }[]} */
  const lista = [{ titulo: "", linhas: [] }];
  for (const linha of texto.replace(/\r\n?/g, "\n").split("\n")) {
    const titulo = /^#{1,6}\s+(.*\S)\s*$/.exec(linha);
    if (titulo) lista.push({ titulo: titulo[1], linhas: [] });
    else lista[lista.length - 1].linhas.push(linha);
  }
  return lista;
}

/**
 * @param {string} texto
 * @param {{ fonte?: string, tamanhoMax?: number, sobreposicao?: number }} [opcoes]
 * @returns {Trecho[]}
 */
function fragmentar(texto, opcoes = {}) {
  const { fonte = "", tamanhoMax = PADRAO.tamanhoMax, sobreposicao = PADRAO.sobreposicao } = opcoes;
  if (!Number.isInteger(tamanhoMax) || tamanhoMax < 50) throw new Error("tamanhoMax deve ser um inteiro de pelo menos 50.");
  if (!Number.isInteger(sobreposicao) || sobreposicao < 0 || sobreposicao >= tamanhoMax / 2) throw new Error("sobreposicao deve ser um inteiro entre 0 e a metade de tamanhoMax.");

  /** @type {Trecho[]} */
  const trechos = [];
  for (const { titulo, linhas } of secoes(String(texto ?? ""))) {
    const unidades = linhas.join("\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .flatMap((p) => (p.length > tamanhoMax ? janelas(p, tamanhoMax, sobreposicao) : [p]));
    let atual = "";
    const fechar = () => { if (atual) trechos.push({ fonte, secao: titulo, texto: atual }); };
    for (const unidade of unidades) {
      if (!atual) { atual = unidade; continue; }
      if (atual.length + 2 + unidade.length <= tamanhoMax) { atual += `\n\n${unidade}`; continue; }
      fechar();
      const com = `${cauda(atual, sobreposicao)}\n\n${unidade}`.trim();
      atual = sobreposicao > 0 && com.length <= tamanhoMax ? com : unidade;
    }
    fechar();
  }
  return trechos;
}

module.exports = { fragmentar, PADRAO };
