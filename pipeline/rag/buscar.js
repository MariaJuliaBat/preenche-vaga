// RAG, passo 3: Retrieval (R7, R8). Similaridade de cosseno entre a pergunta e cada Trecho.

/** @param {number[]} a @param {number[]} b */
function cosseno(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let ponto = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { ponto += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na === 0 || nb === 0 ? 0 : ponto / Math.sqrt(na * nb);
}

/**
 * @param {import("./indice").Indice} indice
 * @param {string} consulta
 * @param {import("./vetorizar").Vetorizador} vetorizador
 * @param {{ topK?: number }} [opcoes]
 * @returns {Promise<{ score: number, fonte: string, secao: string, texto: string }[]>}
 */
async function buscar(indice, consulta, vetorizador, { topK = 3 } = {}) {
  const pergunta = String(consulta ?? "").trim();
  const trechos = Object.values(indice?.arquivos || {}).flatMap((a) => a.trechos);
  if (!pergunta || trechos.length === 0 || topK < 1) return []; // R8: sem chamar a API
  const [vetor] = await vetorizador.vetorizar([pergunta], "consulta");
  return trechos
    .map((t) => ({ score: Number(cosseno(vetor, t.vetor).toFixed(4)), fonte: t.fonte, secao: t.secao, texto: t.texto }))
    .sort((x, y) => y.score - x.score)
    .slice(0, topK);
}

module.exports = { buscar, cosseno };
