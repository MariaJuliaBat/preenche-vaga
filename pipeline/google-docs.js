// Lê o Currículo Base (Google Doc) como texto puro, pela API REST do Docs, autenticando com a Service Account.
// O texto inclui a URL de cada hiperlink, porque "LinkedIn" ou "Portfólio" no Doc costumam ser só um link.
const { criarObterToken } = require("./google-auth");

const ESCOPO = "https://www.googleapis.com/auth/documents.readonly";
const BASE = "https://docs.googleapis.com/v1/documents";

/**
 * @param {any[]} elementos conteúdo estrutural do Doc (body.content ou células de tabela)
 * @returns {string}
 */
function textoDosElementos(elementos) {
  let saida = "";
  for (const el of elementos || []) {
    if (el.paragraph) {
      let linha = "";
      for (const parte of el.paragraph.elements || []) {
        const run = parte.textRun;
        if (!run) continue;
        const conteudo = String(run.content || "");
        linha += conteudo;
        const url = run.textStyle?.link?.url;
        // Texto de âncora ("LinkedIn") não mostra o endereço: acrescenta a URL ao lado.
        if (url && conteudo.trim() && !conteudo.includes(url) && !conteudo.includes(url.replace(/^https?:\/\//, ""))) {
          linha = linha.replace(/\n$/, "") + ` (${url})` + (conteudo.endsWith("\n") ? "\n" : "");
        }
      }
      saida += (el.paragraph.bullet && linha.trim() ? "- " : "") + linha;
      if (!linha.endsWith("\n")) saida += "\n";
    } else if (el.table) {
      for (const linha of el.table.tableRows || []) {
        for (const celula of linha.tableCells || []) saida += textoDosElementos(celula.content);
      }
    }
  }
  return saida;
}

/** @param {any} doc resposta de documents.get */
function extrairTexto(doc) {
  return textoDosElementos(doc?.body?.content || []).replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * @param {{ docId: string, contaDeServico?: string, obterToken?: () => Promise<string>, fetchImpl?: typeof fetch }} opcoes
 * @returns {Promise<string>}
 */
async function lerTextoDoc(opcoes) {
  const fetchImpl = opcoes.fetchImpl || fetch;
  const obterToken = opcoes.obterToken || criarObterToken(String(opcoes.contaDeServico), ESCOPO);
  const resposta = await fetchImpl(`${BASE}/${opcoes.docId}`, {
    headers: { Authorization: `Bearer ${await obterToken()}` }
  });
  if (!resposta.ok) {
    const dica = resposta.status === 403 || resposta.status === 404
      ? " Compartilhe o Doc com o e-mail da Service Account e confira se a API Google Docs está ativada no projeto."
      : "";
    throw new Error(`Google Docs respondeu ${resposta.status}.${dica}`);
  }
  return extrairTexto(await resposta.json());
}

module.exports = { extrairTexto, lerTextoDoc };
