// Lote Final e Cota DF (RD17 a RD20).
const { COTA_DF } = require("./pesos");

/**
 * @template {{ pontos: number, ehVagaDF: boolean }} T
 * @param {T[]} aprovadas
 * @param {number} maxLote
 */
function montarLote(aprovadas, maxLote) {
  // sort é estável: em empate, vale a ordem da coleta.
  const porPontos = (/** @type {T} */ a, /** @type {T} */ b) => b.pontos - a.pontos;
  const ordenadas = [...aprovadas].sort(porPontos);
  const tamanho = Math.min(maxLote, ordenadas.length);
  const cotaNecessaria = Math.ceil(tamanho * COTA_DF);

  // Reserva as melhores Vagas DF até a cota; o resto do lote vai pela pontuação, de qualquer local.
  const reservadas = ordenadas.filter((v) => v.ehVagaDF).slice(0, cotaNecessaria);
  const resto = ordenadas.filter((v) => !reservadas.includes(v)).slice(0, tamanho - reservadas.length);
  const lote = [...reservadas, ...resto].sort(porPontos);

  const emDF = lote.filter((v) => v.ehVagaDF).length;
  return {
    lote,
    emDF,
    percentualDF: tamanho > 0 ? Math.round((emDF / tamanho) * 100) : 0,
    cotaNecessaria,
    cotaAtingida: emDF >= cotaNecessaria
  };
}

module.exports = { montarLote };
