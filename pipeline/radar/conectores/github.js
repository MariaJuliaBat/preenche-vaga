// Conector dos repositórios de vagas do GitHub (ex.: frontend-br/vagas), que usam Issues: cada issue é uma vaga,
// com link individual e data de criação confirmados pela própria API pública.
// O Conector só traduz a fonte para Vaga Bruta: não filtra, não pontua (RD1).
const BASE = "https://api.github.com";
const LIMITE_DE_TEXTO = 20000;

/**
 * Um Conector por repositório: se um falhar, os outros seguem (RD3).
 * @param {{ repos: string[], token?: string, fetchImpl?: typeof fetch, agora?: () => Date }} opcoes
 * @returns {import("../tipos").Conector[]}
 */
function criarConectoresGithub(opcoes) {
  const fetchImpl = opcoes.fetchImpl || fetch;
  const agora = opcoes.agora || (() => new Date());

  /** @param {string} url */
  async function pegar(url) {
    const resposta = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "pipeline-radar",
        ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {})
      }
    });
    if (!resposta.ok) {
      const dica = resposta.status === 403 || resposta.status === 429
        ? " Limite de requisições? Defina GITHUB_TOKEN no .env para aumentar o limite."
        : "";
      throw new Error(`GitHub respondeu ${resposta.status}.${dica}`);
    }
    return resposta.json();
  }

  return opcoes.repos.map((repo) => {
    const nome = `GitHub (${repo})`;
    return {
      nome,
      /** @param {{ foco: "geral" | "df" }} consulta */
      async buscar({ foco }) {
        let itens;
        if (foco === "df") {
          // Busca focada: só issues abertas que citam Brasília.
          const q = encodeURIComponent(`repo:${repo} is:issue is:open Brasília`);
          const dados = await pegar(`${BASE}/search/issues?q=${q}&sort=created&order=desc&per_page=100`);
          itens = dados.items || [];
        } else {
          const desde = new Date(agora().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
          itens = await pegar(`${BASE}/repos/${repo}/issues?state=open&sort=created&direction=desc&per_page=100&since=${encodeURIComponent(desde)}`);
        }
        if (!Array.isArray(itens)) throw new Error("resposta inesperada do GitHub");

        return itens
          .filter((issue) => !issue.pull_request)
          .map((issue) => ({
            titulo: String(issue.title || ""),
            url: String(issue.html_url || ""),
            descricao: String(issue.body || "").slice(0, LIMITE_DE_TEXTO),
            rotulos: (issue.labels || []).map((/** @type {any} */ l) => String(typeof l === "string" ? l : l.name || "")).filter(Boolean),
            publicadaEm: issue.created_at,
            encerrada: issue.state === "closed",
            fonte: nome
          }));
      }
    };
  });
}

module.exports = { criarConectoresGithub };
