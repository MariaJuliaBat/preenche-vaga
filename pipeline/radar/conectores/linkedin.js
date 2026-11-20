// Conector do LinkedIn Jobs pela busca pública "guest" (sem login, sem sessão): a candidata NÃO é identificada.
// Poucas buscas, espaçadas, com o User-Agent do próprio Pipeline (sem se passar por navegador). O LinkedIn limita consultas
// automatizadas (HTTP 429/999): no 429 espera 10 s e tenta UMA vez; se ainda assim limitar, PARA e relata. Nunca troca de
// identidade nem tenta contornar o limite. A filtragem por tecnologia é feita depois, no classificador.
const { pausar, FonteBloqueada, textoDoHtml } = require("./comum");

const BASE = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search";
const DF = "Bras%C3%ADlia%2C%20Federal%20District%2C%20Brazil";
const BRASIL = "Brazil";
const ULTIMOS_14_DIAS = "r1209600";
const ESPERA_APOS_429_MS = 10000;

/**
 * Buscas amplas (no máximo 2 por rodada): Brasília presencial/híbrido e remoto no Brasil. f_WT: 1 presencial, 3 híbrido, 2 remoto.
 * @typedef {{ palavras: string, local: string, wt: string, tipo: "presencial_ou_hibrido" | "remoto" }} Busca
 * @type {readonly Busca[]}
 */
const BUSCAS_PADRAO = Object.freeze([
  { palavras: "estágio TI", local: DF, wt: "1%2C3", tipo: "presencial_ou_hibrido" },
  { palavras: "desenvolvedor júnior", local: BRASIL, wt: "2", tipo: "remoto" }
]);

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
 * @param {{ buscas?: readonly Busca[], fetchImpl?: typeof fetch, esperar?: (ms: number) => Promise<void>, aleatorio?: () => number }} [opcoes]
 * @returns {import("../tipos").Conector}
 */
function criarConectorLinkedin(opcoes = {}) {
  const buscas = opcoes.buscas || BUSCAS_PADRAO;
  const fetchImpl = opcoes.fetchImpl || fetch;
  const esperar = opcoes.esperar || pausar;
  const aleatorio = opcoes.aleatorio || Math.random;

  /** @param {string} url */
  const pedir = (url) => fetchImpl(url, { headers: { Accept: "text/html", "User-Agent": "pipeline-radar" } });

  return {
    nome: "LinkedIn",
    /** @param {{ foco: "geral" | "df" }} consulta */
    async buscar({ foco }) {
      // Foco DF: só a busca de Brasília. Geral: as duas (nunca mais de 2 requisições por rodada).
      const doFoco = foco === "df" ? buscas.filter((b) => b.tipo === "presencial_ou_hibrido") : buscas;

      /** @type {Map<string, import("../tipos").VagaBruta>} */
      const vagas = new Map();
      let primeira = true;
      for (const { palavras, local, wt, tipo } of doFoco.slice(0, 2)) {
        if (!primeira) await esperar(4000 + Math.floor(aleatorio() * 1000)); // 4 a 5 s entre as buscas
        primeira = false;
        const url = `${BASE}?keywords=${encodeURIComponent(palavras)}&location=${local}&f_TPR=${ULTIMOS_14_DIAS}&f_WT=${wt}&start=0`;

        let resposta = await pedir(url);
        if (resposta.status === 429) {
          await esperar(ESPERA_APOS_429_MS); // espera e tenta UMA vez
          resposta = await pedir(url);
        }
        if (resposta.status === 429 || resposta.status === 999 || resposta.status === 403) {
          throw new FonteBloqueada(`O LinkedIn limitou ou bloqueou a busca (HTTP ${resposta.status}). Não contorno esse limite: tente mais tarde ou de outra rede.`);
        }
        if (!resposta.ok) throw new Error(`LinkedIn respondeu ${resposta.status}.`);
        for (const v of lerCartoes(await resposta.text(), tipo)) if (!vagas.has(v.url)) vagas.set(v.url, v);
      }
      return [...vagas.values()];
    }
  };
}

module.exports = { criarConectorLinkedin, lerCartoes, BUSCAS_PADRAO };
