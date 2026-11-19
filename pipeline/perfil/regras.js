// Extração Determinística (PF2): e-mail, telefone, LinkedIn e GitHub por regra, sem LLM.

/** @param {string} texto @returns {string | null} */
function acharEmail(texto) {
  const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(texto);
  return m ? m[0] : null;
}

/**
 * Telefone brasileiro com DDD, com ou sem +55, parênteses, espaço ou hífen.
 * @param {string} texto @returns {string | null}
 */
function acharTelefone(texto) {
  const m = /(?:\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/.exec(texto);
  return m ? m[0].trim() : null;
}

/** @param {string} texto @returns {string | null} */
function acharLinkedin(texto) {
  const m = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_%-]+\/?/i.exec(texto);
  if (!m) return null;
  return /^https?:\/\//i.test(m[0]) ? m[0] : `https://${m[0]}`;
}

/** Perfil do GitHub (github.com/usuario), não um repositório. @param {string} texto @returns {string | null} */
function acharGithub(texto) {
  const m = /(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9-]+)(?![A-Za-z0-9-])/i.exec(texto);
  return m ? `https://github.com/${m[1]}` : null;
}

/** @param {string} texto */
function extrairDeterministico(texto) {
  return {
    email: acharEmail(texto),
    telefone: acharTelefone(texto),
    linkedin: acharLinkedin(texto),
    github: acharGithub(texto)
  };
}

module.exports = { acharEmail, acharTelefone, acharLinkedin, acharGithub, extrairDeterministico };
