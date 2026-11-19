// Recupera o texto de uma vaga já registrada na planilha (que só guarda o link). Ordem: cache do Radar (output/vagas.json),
// depois a fonte original quando ela tem API pública (issues do GitHub; a Gupy entra no Conector dela). Sem texto, o currículo
// sai só com o título da vaga e o gerador avisa.
const { lerVagaSalva } = require("../lote-arquivo");

const LIMITE_DA_DESCRICAO = 6000;
const ISSUE_DO_GITHUB = /github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)/;

/**
 * @param {string} url
 * @param {{ token?: string, fetchImpl?: typeof fetch }} opcoes
 */
async function issueDoGithub(url, opcoes) {
  const m = ISSUE_DO_GITHUB.exec(url);
  if (!m) return null;
  const resposta = await (opcoes.fetchImpl || fetch)(`https://api.github.com/repos/${m[1]}/issues/${m[2]}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "pipeline-radar",
      ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {})
    }
  });
  if (!resposta.ok) return null;
  const issue = await resposta.json();
  return { titulo: String(issue.title || ""), descricao: String(issue.body || "").slice(0, LIMITE_DA_DESCRICAO) };
}

/**
 * @param {{ url: string, config: any, fetchImpl?: typeof fetch }} args
 * @returns {Promise<{ titulo?: string, descricao: string } | null>}
 */
async function obterDescricaoDaVaga({ url, config, fetchImpl }) {
  const salva = lerVagaSalva(config, url);
  if (salva?.descricao) return { titulo: salva.titulo, descricao: String(salva.descricao) };
  try {
    return await issueDoGithub(url, { token: config.radar?.githubToken, fetchImpl });
  } catch {
    return null; // sem rede ou limite da API: segue só com o título
  }
}

module.exports = { obterDescricaoDaVaga };
