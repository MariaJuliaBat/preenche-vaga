// Ancoragem (PF3): um valor só vale se aparece no Texto do Currículo Base. Comparação Normalizada
// (minúsculas, sem acento, pontuação virando espaço). Na dúvida, descarta.
const { normalizar } = require("../radar/texto");

/** @param {unknown} texto */
const compactar = (texto) => normalizar(texto).replace(/[^a-z0-9+#]+/g, " ").trim();

/** @param {unknown} texto @returns {string[]} */
const numerosEm = (texto) => String(texto ?? "").match(/\d+/g) || [];

/** @param {string} texto @returns {Set<string>} */
const palavrasDe = (texto) => new Set(compactar(texto).split(" ").filter((p) => p.length >= 3));

/**
 * @param {string} base
 */
function criarAncora(base) {
  const baseCompacta = ` ${compactar(base)} `;
  const baseNumeros = new Set(numerosEm(base));
  const basePalavras = palavrasDe(base);

  return {
    /** O valor, inteiro, aparece no texto. */
    contem(/** @type {string | null | undefined} */ valor) {
      const v = compactar(valor);
      return v.length > 0 && baseCompacta.includes(` ${v} `);
    },
    /** Período: todo número do valor existe no texto (ex.: "2023 - 2024"); sem números, vale como texto. */
    periodo(/** @type {string | null | undefined} */ valor) {
      const nums = numerosEm(valor);
      if (nums.length === 0) return this.contem(valor);
      return nums.every((n) => baseNumeros.has(n));
    },
    /** Frase livre (descrição): quase todas as palavras e todos os números existem no texto. */
    frase(/** @type {string | null | undefined} */ valor, minimo = 0.8) {
      const palavras = [...palavrasDe(String(valor ?? ""))];
      if (palavras.length === 0) return false;
      if (!numerosEm(valor).every((n) => baseNumeros.has(n))) return false;
      return palavras.filter((p) => basePalavras.has(p)).length / palavras.length >= minimo;
    }
  };
}

module.exports = { criarAncora, compactar, numerosEm, palavrasDe };
