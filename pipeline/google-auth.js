// Token de acesso da Service Account do Google, compartilhado por Sheets e Docs.
// Usa o cliente JWT direto: `keyFile` e `credentials` do GoogleAuth estão obsoletos e imprimem aviso.
const { readFileSync } = require("node:fs");

/**
 * @param {string} contaDeServico caminho do JSON da Service Account
 * @param {string} escopo escopo OAuth (um só)
 * @returns {() => Promise<string>}
 */
function criarObterToken(contaDeServico, escopo) {
  /** @type {import("google-auth-library").JWT | undefined} */
  let auth;
  return async () => {
    if (!auth) {
      const { JWT } = require("google-auth-library");
      const chave = JSON.parse(readFileSync(contaDeServico, "utf8"));
      auth = new JWT({ email: chave.client_email, key: chave.private_key, scopes: [escopo] });
    }
    const { token } = await auth.getAccessToken();
    if (!token) throw new Error("Não consegui obter token do Google com a Service Account.");
    return token;
  };
}

module.exports = { criarObterToken };
