// Conector do InfoJobs Brasil (infojobs.com.br): a página pública de busca por cidade vem renderizada no servidor,
// com um cartão por vaga (título, empresa, local, modalidade, data). Sem login, sem sessão, sem navegador.
// Cada busca devolve poucos cartões (os demais carregam por rolagem): é uma fonte complementar.
const { TERMOS_DE_BUSCA, pausar, FonteBloqueada, textoDoHtml } = require("./comum");

const BASE = "https://www.infojobs.com.br";

/** "2026/11/19 06:31:00" → "2026-11-19T06:31:00" (horário de Brasília, sem fuso). @param {string | undefined} valor */
function dataIso(valor) {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})(?:\s+(\d{2}:\d{2}:\d{2}))?/.exec(String(valor || "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4] || "00:00:00"}` : undefined;
}

/** @param {string} texto @returns {string | undefined} */
function modalidadeDe(texto) {
  const t = texto.toLowerCase();
  if (/home office|remoto/.test(t)) return "remoto";
  if (/h[ií]brido/.test(t)) return "hibrido";
  if (/presencial/.test(t)) return "presencial";
  return undefined;
}

/**
 * Cartões da página de busca.
 * @param {string} html
 * @returns {import("../tipos").VagaBruta[]}
 */
function lerCartoesInfojobs(html) {
  /** @type {import("../tipos").VagaBruta[]} */
  const vagas = [];
  // Os tooltips trazem HTML com ">" dentro de atributos (data-bs-title, title): sem tirá-los, as expressões abaixo se perdem.
  const limpo = String(html).replace(/(data-bs-title|title)="[^"]*"/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "");
  for (const bloco of limpo.split(/class="[^"]*js_rowCard[^"]*"/).slice(1)) {
    const href = /data-href="([^"]+)"/.exec(bloco)?.[1];
    const titulo = /js_vacancyTitle[^>]*>([\s\S]*?)<\/h2>/.exec(bloco)?.[1];
    if (!href || !titulo) continue;
    const empresa = /<a class="text-body text-decoration-none"[^>]*>([\s\S]*?)<\/a>/.exec(bloco)?.[1];
    // Depois da empresa: linha do local (<div class="mb-8">), linha de chips (salário, escolaridade, modalidade) e o resumo.
    const local = /<div class="mb-8">\s*([^<]+?)\s*<\/div>/.exec(bloco)?.[1];
    const chips = [...(/<div class="d-inline-flex[^>]*>((?:\s*<div>[^<]*<\/div>)+)/.exec(bloco)?.[1] || "").matchAll(/<div>\s*([^<]+?)\s*<\/div>/g)].map((m) => textoDoHtml(m[1]));
    const resumo = /<div class="text-medium">\s*([^<]{20,}?)\s*<\/div>/.exec(bloco)?.[1];
    vagas.push({
      titulo: textoDoHtml(titulo),
      url: `${BASE}${href}`,
      empresa: empresa ? textoDoHtml(empresa) : "",
      descricao: resumo ? textoDoHtml(resumo) : "",
      rotulos: chips,
      local: local ? textoDoHtml(local) : "",
      modalidade: modalidadeDe(chips.join(" ")),
      publicadaEm: dataIso(/js_date"\s+data-value="([^"]+)"/.exec(bloco)?.[1]),
      fonte: "InfoJobs"
    });
  }
  return vagas;
}

/**
 * @param {{ termos?: readonly string[], fetchImpl?: typeof fetch, esperar?: (ms: number) => Promise<void> }} [opcoes]
 * @returns {import("../tipos").Conector}
 */
function criarConectorInfojobs(opcoes = {}) {
  const termos = opcoes.termos || TERMOS_DE_BUSCA;
  const fetchImpl = opcoes.fetchImpl || fetch;
  const esperar = opcoes.esperar || pausar;

  return {
    nome: "InfoJobs",
    async buscar() {
      /** @type {Map<string, import("../tipos").VagaBruta>} */
      const vagas = new Map();
      /** @type {string[]} */
      const erros = [];
      let primeira = true;
      for (const termo of termos) {
        if (!primeira) await esperar(1500);
        primeira = false;
        try {
          const caminho = `/vagas-de-emprego-${encodeURIComponent(termo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()).replace(/%20/g, "+")}-em-brasilia,-df.aspx`;
          const resposta = await fetchImpl(`${BASE}${caminho}`, { headers: { Accept: "text/html", "User-Agent": "pipeline-radar" }, redirect: "follow" });
          if (resposta.status === 403 || resposta.status === 429) throw new FonteBloqueada(`O InfoJobs limitou ou bloqueou a busca (HTTP ${resposta.status}). Não contorno esse limite.`);
          if (!resposta.ok) throw new Error(`InfoJobs respondeu ${resposta.status}.`);
          for (const v of lerCartoesInfojobs(await resposta.text())) if (!vagas.has(v.url)) vagas.set(v.url, v);
        } catch (erro) {
          if (erro instanceof FonteBloqueada) throw erro;
          erros.push(erro instanceof Error ? erro.message : String(erro));
        }
      }
      if (vagas.size === 0 && erros.length > 0) throw new Error(erros[0]);
      return [...vagas.values()];
    }
  };
}

module.exports = { criarConectorInfojobs, lerCartoesInfojobs, dataIso };
