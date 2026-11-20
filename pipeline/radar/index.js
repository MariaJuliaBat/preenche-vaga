// Radar de Vagas: coleta nos Conectores, classifica, pontua e monta o Lote Final com a Cota DF (RD1 a RD22).
// Não escreve na planilha nem abre formulário: devolve o resultado e quem chama decide (ver etapa.js).
const { normalizarUrl } = require("../sheets");
const { classificar } = require("./classificar");
const { pontuar } = require("./pontuar");
const { montarLote } = require("./lote");

/**
 * @typedef {object} Aprovada
 * @property {import("./tipos").VagaBruta} vaga
 * @property {number} pontos
 * @property {boolean} ehVagaDF
 * @property {string | null} modalidade
 * @property {string[]} alertas
 * @property {string[]} ia termos de IA aplicada achados
 * @property {string[]} stack habilidades do Perfil achadas
 * @property {"dev" | "ti" | null} area desenvolvimento/automação/IA ("dev") ou outra área de TI de nível de entrada ("ti")
 */

/**
 * @param {object} opcoes
 * @param {import("./tipos").Conector[]} opcoes.conectores
 * @param {Set<string>} [opcoes.urlsExistentes] URLs já na planilha, normalizadas (RD4)
 * @param {import("./tipos").Perfil} [opcoes.perfil]
 * @param {number} [opcoes.vigenciaDias]
 * @param {number} [opcoes.maxLote]
 * @param {Date} [opcoes.hoje]
 * @param {(tipo: "descartes" | "pistas", entrada: Record<string, unknown>) => void} [opcoes.registrar]
 */
async function executarRadar(opcoes) {
  const {
    conectores, urlsExistentes = new Set(), perfil = {}, vigenciaDias = 20, maxLote = 10,
    hoje = new Date(), registrar = () => {}
  } = opcoes;

  /** @type {{ conector: string, foco: string, erro: string }[]} */
  const falhas = [];
  /** @type {Aprovada[]} */
  const aprovadas = [];
  /** @type {Record<string, unknown>[]} */
  const pistas = [];
  /** @type {Record<string, unknown>[]} */
  const descartes = [];
  const jaProcessadas = new Set();

  /** @param {"geral" | "df"} foco */
  async function coletar(foco) {
    /** @type {import("./tipos").VagaBruta[]} */
    const brutas = [];
    for (const conector of conectores) {
      try {
        const vagas = await conector.buscar({ foco });
        if (!Array.isArray(vagas)) throw new Error("o Conector não devolveu uma lista de vagas");
        for (const v of vagas) brutas.push({ ...v, fonte: v.fonte || conector.nome });
      } catch (erro) {
        // RD3: uma fonte que falha não derruba as outras.
        falhas.push({ conector: conector.nome, foco, erro: erro instanceof Error ? erro.message : String(erro) });
      }
    }
    return brutas;
  }

  /** @param {import("./tipos").VagaBruta[]} brutas */
  function processar(brutas) {
    const vistasNoLote = new Set();
    for (const vaga of brutas) {
      const chave = normalizarUrl(vaga.url);
      // Já tratada na busca anterior desta execução: não conta de novo nem polui os logs.
      if (chave && jaProcessadas.has(chave)) continue;
      const base = { titulo: vaga.titulo, url: vaga.url, fonte: vaga.fonte };

      if (chave && (urlsExistentes.has(chave) || vistasNoLote.has(chave))) {
        const entrada = { ...base, motivo: "duplicada" };
        descartes.push(entrada);
        registrar("descartes", entrada);
        continue;
      }
      if (chave) vistasNoLote.add(chave);

      const c = classificar(vaga, { hoje, vigenciaDias, perfil });
      if (c.resultado === "descarte") {
        const entrada = { ...base, motivo: c.motivo, detalhe: c.detalhe };
        descartes.push(entrada);
        registrar("descartes", entrada);
      } else if (c.resultado === "pista") {
        const entrada = { ...base, motivo: c.motivo };
        pistas.push(entrada);
        registrar("pistas", entrada);
      } else {
        const p = pontuar(vaga, c, perfil);
        aprovadas.push({
          vaga, pontos: p.pontos, ehVagaDF: Boolean(c.local?.ehVagaDF), modalidade: c.local?.modalidade || null,
          alertas: c.alertas || [], ia: p.ia, stack: p.stack, area: c.area || null
        });
      }
    }
    for (const chave of vistasNoLote) jaProcessadas.add(chave);
  }

  processar(await coletar("geral"));
  let montado = montarLote(aprovadas, maxLote);

  // RD17: cota não atingida → UMA segunda busca só no DF.
  let segundaBusca = false;
  // Lote vazio também conta como abaixo da cota: vale tentar o DF antes de desistir.
  if (!montado.cotaAtingida || montado.lote.length === 0) {
    segundaBusca = true;
    processar(await coletar("df"));
    montado = montarLote(aprovadas, maxLote);
  }

  return { ...montado, segundaBusca, aprovadas, pistas, descartes, falhas };
}

module.exports = { executarRadar };
