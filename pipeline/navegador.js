// Abre o Chrome ou o Edge instalado (sem sessão, sem perfil): usado para gerar PDF e para buscas públicas do Radar.
// PDF_BROWSER_PATH tem prioridade; senão tenta os canais instalados. Nada de disfarce: o navegador se identifica normalmente.

/** @param {Record<string, string | undefined>} [env] */
async function abrirNavegador(env = process.env) {
  const { chromium } = require("playwright-core");
  if (env.PDF_BROWSER_PATH) return chromium.launch({ executablePath: env.PDF_BROWSER_PATH });
  /** @type {unknown} */
  let ultimoErro = null;
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel });
    } catch (erro) {
      ultimoErro = erro;
    }
  }
  throw new Error(`Não achei Chrome nem Edge (defina PDF_BROWSER_PATH com o caminho do executável). ${ultimoErro instanceof Error ? ultimoErro.message.split("\n")[0] : ""}`);
}

module.exports = { abrirNavegador };
