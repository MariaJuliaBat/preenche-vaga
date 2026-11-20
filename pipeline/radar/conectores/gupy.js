// Conector da Gupy (portal.gupy.io): a página pública de busca consome a API JSON pública
// https://portal.gupy.io/api/job-search/jobs (a mesma que o navegador chama), com cidade, modalidade, tipo (estágio),
// data de publicação e link individual já estruturados. Sem login, sem sessão, sem navegador.
const { TERMOS_DE_BUSCA, pausar, textoDoHtml } = require("./comum");

const BASE = "https://portal.gupy.io/api/job-search/jobs";
const LIMITE_DE_TEXTO = 20000;
const MODALIDADE = /** @type {Record<string, string>} */ ({ "on-site": "presencial", hybrid: "hibrido", remote: "remoto" });

/**
 * @param {{ termos?: readonly string[], fetchImpl?: typeof fetch, esperar?: (ms: number) => Promise<void>, agora?: () => Date }} [opcoes]
 * @returns {import("../tipos").Conector}
 */
function criarConectorGupy(opcoes = {}) {
  const termos = opcoes.termos || TERMOS_DE_BUSCA;
  const fetchImpl = opcoes.fetchImpl || fetch;
  const esperar = opcoes.esperar || pausar;
  const agora = opcoes.agora || (() => new Date());

  /** @param {Record<string, any>} d @returns {import("../tipos").VagaBruta} */
  function paraVagaBruta(d) {
    const prazo = d.applicationDeadline ? new Date(d.applicationDeadline) : null;
    return {
      titulo: String(d.name || ""),
      url: String(d.jobUrl || ""),
      empresa: String(d.careerPageName || ""),
      descricao: textoDoHtml(d.description).slice(0, LIMITE_DE_TEXTO),
      local: [d.city, d.state].filter(Boolean).join(" - "),
      modalidade: MODALIDADE[String(d.workplaceType)] || undefined,
      nivel: d.type === "vacancy_type_internship" ? "estágio" : undefined,
      publicadaEm: d.publishedDate || undefined,
      encerrada: prazo !== null && !Number.isNaN(prazo.getTime()) && prazo.getTime() < agora().getTime(),
      fonte: "Gupy"
    };
  }

  return {
    nome: "Gupy",
    /** @param {{ foco: "geral" | "df" }} consulta */
    async buscar({ foco }) {
      // Foco DF: só o Distrito Federal (a Gupy lista cidade e estado). Geral: DF e também as vagas remotas.
      const consultas = foco === "df"
        ? [{ filtro: "state=Distrito%20Federal", limite: 100 }]
        : [{ filtro: "state=Distrito%20Federal", limite: 50 }, { filtro: "workplaceType=remote", limite: 30 }];

      /** @type {Map<string, import("../tipos").VagaBruta>} */
      const vagas = new Map();
      /** @type {string[]} */
      const erros = [];
      let primeira = true;
      for (const termo of termos) {
        for (const { filtro, limite } of consultas) {
          if (!primeira) await esperar(300);
          primeira = false;
          try {
            const resposta = await fetchImpl(`${BASE}?jobName=${encodeURIComponent(termo)}&limit=${limite}&offset=0&${filtro}`, {
              headers: { Accept: "application/json", "User-Agent": "pipeline-radar" }
            });
            if (!resposta.ok) throw new Error(`Gupy respondeu ${resposta.status}.`);
            const dados = await resposta.json();
            if (!Array.isArray(dados?.data)) throw new Error("resposta inesperada da Gupy");
            for (const d of dados.data) {
              const vaga = paraVagaBruta(d);
              if (vaga.url && !vagas.has(vaga.url)) vagas.set(vaga.url, vaga);
            }
          } catch (erro) {
            erros.push(erro instanceof Error ? erro.message : String(erro));
          }
        }
      }
      // Falhou tudo: avisa. Falhou só uma busca: segue com o que veio.
      if (vagas.size === 0 && erros.length > 0) throw new Error(erros[0]);
      return [...vagas.values()];
    }
  };
}

module.exports = { criarConectorGupy };
