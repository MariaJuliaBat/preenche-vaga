// Conector da Sólides Vagas (vagas.solides.com.br): a página pública de busca consome uma API JSON pública
// (https://vagas.solides.com.br/api/vacancies), com empresa, cidade, tipo (presencial/híbrido/remoto), senioridade e data.
// Sem login, sem sessão, sem navegador. A busca textual da Sólides é larga ("estágio TI" traz Direito e RH): o classificador filtra.
// Cobre só Brasília - DF: o filtro de remoto da API não foi confirmado, então não é usado.
const { TERMOS_DE_BUSCA, pausar, textoDoHtml } = require("./comum");

const BASE = "https://vagas.solides.com.br";
const LIMITE_DE_TEXTO = 20000;
const POR_PAGINA = 20;

/** @param {unknown} tipo @returns {string | undefined} */
function modalidadeDe(tipo) {
  const t = String(tipo || "").toLowerCase();
  if (/remot|home/.test(t)) return "remoto";
  if (/h[ií]brid/.test(t)) return "hibrido";
  if (/presencial/.test(t)) return "presencial";
  return undefined;
}

/** @param {unknown} lista @returns {string[]} */
const nomes = (lista) => (Array.isArray(lista) ? lista.map((x) => String(x?.name || "")).filter(Boolean) : []);

/**
 * @param {{ termos?: readonly string[], fetchImpl?: typeof fetch, esperar?: (ms: number) => Promise<void>, agora?: () => Date }} [opcoes]
 * @returns {import("../tipos").Conector}
 */
function criarConectorSolides(opcoes = {}) {
  const termos = opcoes.termos || TERMOS_DE_BUSCA;
  const fetchImpl = opcoes.fetchImpl || fetch;
  const esperar = opcoes.esperar || pausar;
  const agora = opcoes.agora || (() => new Date());

  /** @param {Record<string, any>} d @returns {import("../tipos").VagaBruta} */
  function paraVagaBruta(d) {
    const prazo = d.date?.due ? new Date(`${d.date.due}T23:59:59`) : null;
    return {
      titulo: String(d.title || ""),
      url: `${BASE}/vaga/${d.id}`, // o redirectLink é o site da empresa e vem quebrado em alguns casos
      empresa: String(d.companyName || ""),
      descricao: textoDoHtml(d.description).slice(0, LIMITE_DE_TEXTO),
      rotulos: nomes(d.recruitmentContractType),
      local: [d.city?.name, d.state?.code].filter(Boolean).join(" - "),
      modalidade: modalidadeDe(d.jobType),
      nivel: nomes(d.seniority).join(" "),
      publicadaEm: d.createdAt || undefined,
      encerrada: (d.currentState && d.currentState !== "em_andamento") || (prazo !== null && !Number.isNaN(prazo.getTime()) && prazo.getTime() < agora().getTime()),
      fonte: "Sólides"
    };
  }

  return {
    nome: "Sólides",
    async buscar() {
      /** @type {Map<string, import("../tipos").VagaBruta>} */
      const vagas = new Map();
      /** @type {string[]} */
      const erros = [];
      let primeira = true;
      for (const termo of termos) {
        if (!primeira) await esperar(1000);
        primeira = false;
        try {
          const url = `${BASE}/api/vacancies?page=1&take=${POR_PAGINA}&title=${encodeURIComponent(termo).replace(/%20/g, "+")}&locations=Bras%C3%ADlia+-+DF`;
          const resposta = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "pipeline-radar" } });
          if (!resposta.ok) throw new Error(`Sólides respondeu ${resposta.status}.`);
          const dados = await resposta.json();
          if (!Array.isArray(dados?.data)) throw new Error("resposta inesperada da Sólides");
          for (const d of dados.data) {
            const vaga = paraVagaBruta(d);
            if (d.id && !vagas.has(vaga.url)) vagas.set(vaga.url, vaga);
          }
        } catch (erro) {
          erros.push(erro instanceof Error ? erro.message : String(erro));
        }
      }
      if (vagas.size === 0 && erros.length > 0) throw new Error(erros[0]);
      return [...vagas.values()];
    }
  };
}

module.exports = { criarConectorSolides };
