// Conector do LinkedIn Jobs pela busca pública "guest" (sem login, sem sessão): a candidata NÃO é identificada.
// O LinkedIn limita e bloqueia consultas automatizadas (HTTP 429/999): quando isso acontece o Conector PARA e relata;
// ele nunca insiste, troca de identidade ou tenta contornar o limite.
const { TERMOS_DE_BUSCA, pausar, FonteBloqueada, textoDoHtml } = require("./comum");

const BASE = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const DF = "Bras%C3%ADlia%2C%20Federal%20District%2C%20Brazil";
const BRASIL = "Brazil";
const ULTIMOS_14_DIAS = "r1209600";

/**
 * Cartões da resposta (um <li> por vaga). O link perde os parâmetros de rastreio.
 * @param {string} html
 * @param {"presencial_ou_hibrido" | "remoto"} tipo o filtro usado na busca (o cartão não diz a modalidade)
 * @returns {import("../tipos").VagaBruta[]}
 */
function lerCartoes(html, tipo) {
  /** @type {import("../tipos").VagaBruta[]} */
  const vagas = [];
  for (const [, cartao] of String(html).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const link = /href="(https?:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^"]+)"/i.exec(cartao)?.[1];
    const titulo = /base-search-card__title[^>]*>([\s\S]*?)<\/h3>/i.exec(cartao)?.[1];
    if (!link || !titulo) continue;
    const empresa = /base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/i.exec(cartao)?.[1];
    const local = /job-search-card__location[^>]*>([\s\S]*?)<\/span>/i.exec(cartao)?.[1];
    const data = /<time\b[^>]*datetime="(\d{4}-\d{2}-\d{2})/i.exec(cartao)?.[1];
    vagas.push({
      titulo: textoDoHtml(titulo),
      url: textoDoHtml(link).split("?")[0],
      empresa: empresa ? textoDoHtml(empresa) : "",
      local: local ? textoDoHtml(local) : "",
      modalidade: tipo === "remoto" ? "remoto" : undefined,
      publicadaEm: data,
      fonte: "LinkedIn"
    });
  }
  return vagas;
}

/**
 * @param {{ termos?: readonly string[], fetchImpl?: typeof fetch, esperar?: (ms: number) => Promise<void> }} [opcoes]
 * @returns {import("../tipos").Conector}
 */
function criarConectorLinkedin(opcoes = {}) {
  const termos = opcoes.termos || TERMOS_DE_BUSCA;
  const fetchImpl = opcoes.fetchImpl || fetch;
  const esperar = opcoes.esperar || pausar;

  return {
    nome: "LinkedIn",
    /** @param {{ foco: "geral" | "df" }} consulta */
    async buscar({ foco }) {
      // f_WT: 1 presencial, 3 híbrido, 2 remoto. Brasília só presencial/híbrido (remoto não conta como DF).
      const consultas = foco === "df"
        ? [{ local: DF, wt: "1%2C3", tipo: /** @type {const} */ ("presencial_ou_hibrido") }]
        : [{ local: DF, wt: "1%2C3", tipo: /** @type {const} */ ("presencial_ou_hibrido") }, { local: BRASIL, wt: "2", tipo: /** @type {const} */ ("remoto") }];

      /** @type {Map<string, import("../tipos").VagaBruta>} */
      const vagas = new Map();
      let primeira = true;
      for (const termo of termos) {
        for (const { local, wt, tipo } of consultas) {
          if (!primeira) await esperar(1500);
          primeira = false;
          const url = `${BASE}?keywords=${encodeURIComponent(termo)}&location=${local}&f_TPR=${ULTIMOS_14_DIAS}&f_WT=${wt}&start=0`;
          const resposta = await fetchImpl(url, { headers: { Accept: "text/html", "User-Agent": "pipeline-radar" } });
          if (resposta.status === 429 || resposta.status === 999 || resposta.status === 403) {
            throw new FonteBloqueada(`O LinkedIn limitou ou bloqueou a busca (HTTP ${resposta.status}). Não contorno esse limite: tente mais tarde ou de outra rede.`);
          }
          if (!resposta.ok) throw new Error(`LinkedIn respondeu ${resposta.status}.`);
          for (const v of lerCartoes(await resposta.text(), tipo)) if (!vagas.has(v.url)) vagas.set(v.url, v);
        }
      }
      return [...vagas.values()];
    }
  };
}

module.exports = { criarConectorLinkedin, lerCartoes };
