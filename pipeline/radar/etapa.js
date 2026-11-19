// Etapa "radar" da CLI: monta os Conectores, roda o Radar e registra o Lote Final na Planilha de Controle.
// Com --dry-run (config.escreverPlanilha=false) lê a planilha para deduplicar, mas não escreve nada (RD22).
const { extrairIdGoogle } = require("../config");
const { criarClienteSheets, lerVagas, registrarVagas } = require("../sheets");
const { executarRadar } = require("./index");
const { criarConectoresGithub } = require("./conectores/github");

const ROTULO = { remoto: "Remoto", hibrido: "Híbrido", presencial: "Presencial" };

/**
 * @param {import("./index").Aprovada} a
 * @returns {import("../sheets").Vaga}
 */
function paraVagaDaPlanilha(a) {
  const modalidade = a.modalidade ? ROTULO[/** @type {keyof typeof ROTULO} */ (a.modalidade)] : "";
  const local = a.ehVagaDF ? `${modalidade} - Brasília/DF` : modalidade;
  return {
    titulo: a.vaga.titulo,
    url: a.vaga.url,
    empresa: a.vaga.empresa || "Não informada",
    site: a.vaga.fonte,
    situacao: "pendente",
    motivoPendencia: "Radar - aguardando currículo e revisão",
    observacoes: [local, ...a.alertas].filter(Boolean).join(" | ")
  };
}

/**
 * @param {{ conectores?: import("./tipos").Conector[], clienteSheets?: ReturnType<typeof criarClienteSheets>, hoje?: Date }} [deps] injeção para testes
 */
function criarEtapaRadar(deps = {}) {
  return async function etapaRadar(/** @type {{ config: any, resultado: any, logs: any }} */ { config, resultado, logs }) {
    const planilhaId = extrairIdGoogle(config.googleSheetUrl);
    const cliente = deps.clienteSheets || criarClienteSheets({ contaDeServico: config.contaDeServico });
    const conectores = deps.conectores
      || criarConectoresGithub({ repos: config.radar.reposGithub, token: config.radar.githubToken });

    const { urlsExistentes } = await lerVagas(cliente, planilhaId);
    // O Perfil (P18) ainda não existe: a stack vem do .env e a formação fica "não informada".
    const perfil = { habilidades: config.radar.stack, formacao: null };

    const r = await executarRadar({
      conectores,
      urlsExistentes,
      perfil,
      vigenciaDias: config.radar.vigenciaDias,
      maxLote: config.radar.maxVagasLote,
      hoje: deps.hoje,
      registrar: (tipo, entrada) => logs.registrar(config.pastas.logs, tipo, entrada)
    });

    const gravacao = await registrarVagas(
      cliente,
      { planilhaId, escreverPlanilha: config.escreverPlanilha },
      r.lote.map(paraVagaDaPlanilha)
    );

    resultado.encontradas = r.lote.length;
    resultado.emBrasilia = r.emDF;
    resultado.remotas = r.lote.length - r.emDF;
    resultado.aprovadas = r.lote.map((a) => ({
      titulo: a.vaga.titulo, empresa: a.vaga.empresa || "", url: a.vaga.url, ehVagaDF: a.ehVagaDF, pontos: a.pontos
    }));
    resultado.alertasFormacao = r.lote.flatMap((a) => a.alertas.map((alerta) => `${a.vaga.titulo}: ${alerta}`));
    resultado.falhasConectores = r.falhas;
    resultado.segundaBusca = r.segundaBusca;
    resultado.gravadasNaPlanilha = gravacao.gravado ? gravacao.escritas : 0;
    resultado.pistas.push(...r.pistas);
    resultado.descartes.push(...r.descartes);
  };
}

module.exports = { criarEtapaRadar, paraVagaDaPlanilha };
