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

/**
 * Nome da empresa sem prefixo ("Grupo") e sem sufixo societário (S.A., Ltda, ME, EIRELI), para comparar "Grupo Ignição Digital" com "Ignição Digital".
 * @param {unknown} empresa
 */
function empresaNormalizada(empresa) {
  const t = normalizar(empresa).replace(/[.,/]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return t
    .replace(/^(grupo|gp)\s+/, "")
    .replace(/(\s+(s a|sa|ltda|me|epp|eireli))+$/, "")
    .trim();
}

/** Chave "empresa|título" da mesma vaga vinda de fontes diferentes; vazia se faltar empresa ou título. @param {{ empresa?: string, titulo?: string }} vaga */
const chaveEmpresaTitulo = (vaga) => {
  const empresa = empresaNormalizada(vaga.empresa);
  const titulo = normalizar(vaga.titulo).replace(/\s+/g, " ").trim();
  return empresa && titulo ? `${empresa}|${titulo}` : "";
};

module.exports = { empresaNormalizada, chaveEmpresaTitulo, normalizar, escapar, regexDoTermo, acharTermo };
