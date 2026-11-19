// Utilitários de texto do Radar: tudo é comparado em minúsculas e sem acento.

/** @param {unknown} texto */
const normalizar = (texto) => String(texto ?? "")
  .toLocaleLowerCase("pt-BR")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "");

/** @param {string} s */
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Expressão que acha o termo inteiro (sem letra ou número colado). O termo já deve estar normalizado.
 * @param {string} termo
 */
const regexDoTermo = (termo) => new RegExp(`(?<![a-z0-9])${escapar(termo)}(?![a-z0-9])`);

/**
 * Primeiro termo (já normalizado) presente no texto já normalizado, ou null.
 * @param {string} textoNormalizado
 * @param {string[]} termos
 */
function acharTermo(textoNormalizado, termos) {
  for (const termo of termos) if (regexDoTermo(termo).test(textoNormalizado)) return termo;
  return null;
}

module.exports = { normalizar, escapar, regexDoTermo, acharTermo };
