// Conector do Indeed Brasil (br.indeed.com) por navegador (Playwright), sem login e sem a sessão da candidata.
// O Indeed protege a busca com verificação anti-robô (HTTP 403, "Security Check" / "Blocked"): quando isso aparece o Conector
// PARA e relata; ele nunca tenta resolver a verificação, disfarçar o navegador ou insistir. As demais fontes seguem (RD3).
const { TERMOS_DE_BUSCA, pausar, FonteBloqueada, textoDoHtml } = require("./comum");
const { abrirNavegador } = require("../../navegador");

const BASE = "https://br.indeed.com";
const DIA_MS = 24 * 60 * 60 * 1000;
const FROMAGE = 14;

const PAGINA_DE_BLOQUEIO = /blocked|security check|just a moment|attention required|verifique que voc[eê] [eé] humano|captcha/i;

/** Quantos dias atrás o cartão diz que a vaga saiu; null se não der para ler. @param {string} texto */
function diasAtras(texto) {
  const t = String(texto).toLowerCase();
  if (/hoje|agora|recente|just posted|today/.test(t)) return 0;
  if (/mais de 30|30\+/.test(t)) return 31;
  const dias = /(\d+)\s*dias?/.exec(t);
  if (dias) return Number.parseInt(dias[1], 10);
  if (/\d+\s*horas?/.test(t)) return 0;
  return null;
}

/**
 * Cartões da página de resultados. A data é aproximada ("há N dias"); sem ela vale o próprio filtro da busca (até 14 dias).
 * @param {string} html
 * @param {Date} hoje
 * @param {"presencial_ou_hibrido" | "remoto"} tipo
 * @returns {import("../tipos").VagaBruta[]}
 */
function lerCartoesIndeed(html, hoje, tipo) {
  /** @type {import("../tipos").VagaBruta[]} */
  const vagas = [];
  const blocos = String(html).split(/class="[^"]*job_seen_beacon[^"]*"/i).slice(1);
  for (const bloco of blocos) {
    const jk = /data-jk="([A-Za-z0-9]+)"/.exec(bloco)?.[1];
    const titulo = /jobTitle[\s\S]*?<span[^>]*title="([^"]+)"/i.exec(bloco)?.[1] || /<h2[^>]*jobTitle[^>]*>([\s\S]*?)<\/h2>/i.exec(bloco)?.[1];
    if (!jk || !titulo) continue;
    const empresa = /data-testid="company-name"[^>]*>([\s\S]*?)<\/span>/i.exec(bloco)?.[1];
    const local = /data-testid="text-location"[^>]*>([\s\S]*?)<\/div>/i.exec(bloco)?.[1];
    const resumo = /(job-snippet|belowJobSnippet)[^>]*>([\s\S]*?)<\/(ul|div)>/i.exec(bloco)?.[2];
    const textoData = /(publicad[ao]|postad[ao]|posted)[^<]{0,40}|\bhoje\b|\brecente\b/i.exec(bloco)?.[0] || "";
    const dias = diasAtras(textoData) ?? FROMAGE;
    vagas.push({
      titulo: textoDoHtml(titulo),
      url: `${BASE}/viewjob?jk=${jk}`,
      empresa: empresa ? textoDoHtml(empresa) : "",
      descricao: resumo ? textoDoHtml(resumo) : "",
      local: local ? textoDoHtml(local) : "",
      modalidade: tipo === "remoto" ? "remoto" : undefined,
      publicadaEm: new Date(hoje.getTime() - dias * DIA_MS).toISOString(),
      fonte: "Indeed"
    });
  }
  return vagas;
}

/**
 * @param {{ termos?: readonly string[], abrir?: typeof abrirNavegador, esperar?: (ms: number) => Promise<void>, agora?: () => Date }} [opcoes]
 * @returns {import("../tipos").Conector}
 */
function criarConectorIndeed(opcoes = {}) {
  const termos = opcoes.termos || TERMOS_DE_BUSCA;
  const abrir = opcoes.abrir || abrirNavegador;
  const esperar = opcoes.esperar || pausar;
  const agora = opcoes.agora || (() => new Date());

  return {
    nome: "Indeed",
    /** @param {{ foco: "geral" | "df" }} consulta */
    async buscar({ foco }) {
      const consultas = foco === "df"
        ? [{ l: "Bras%C3%ADlia%2C+DF", tipo: /** @type {const} */ ("presencial_ou_hibrido") }]
        : [{ l: "Bras%C3%ADlia%2C+DF", tipo: /** @type {const} */ ("presencial_ou_hibrido") }, { l: "Remoto", tipo: /** @type {const} */ ("remoto") }];

      const navegador = await abrir();
      try {
        const pagina = await navegador.newPage();
        /** @type {Map<string, import("../tipos").VagaBruta>} */
        const vagas = new Map();
        let primeira = true;
        for (const termo of termos) {
          for (const { l, tipo } of consultas) {
            if (!primeira) await esperar(2000);
            primeira = false;
            const resposta = await pagina.goto(`${BASE}/jobs?q=${encodeURIComponent(termo).replace(/%20/g, "+")}&l=${l}&fromage=${FROMAGE}&sort=date`, { waitUntil: "domcontentloaded", timeout: 45000 });
            const status = resposta?.status() ?? 0;
            const titulo = await pagina.title();
            if (status === 403 || status === 429 || PAGINA_DE_BLOQUEIO.test(titulo)) {
              throw new FonteBloqueada(`O Indeed pediu verificação anti-robô (HTTP ${status}, "${titulo}"). Não contorno essa verificação: as outras fontes seguem.`);
            }
            for (const v of lerCartoesIndeed(await pagina.content(), agora(), tipo)) if (!vagas.has(v.url)) vagas.set(v.url, v);
          }
        }
        return [...vagas.values()];
      } finally {
        await navegador.close().catch(() => {});
      }
    }
  };
}

module.exports = { criarConectorIndeed, lerCartoesIndeed, diasAtras };
