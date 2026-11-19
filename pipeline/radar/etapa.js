// Etapa "radar" da CLI: monta os Conectores, roda o Radar e registra o Lote Final na Planilha de Controle.
// Com --dry-run (config.escreverPlanilha=false) lê a planilha para deduplicar, mas não escreve nada (RD22).
const { extrairIdGoogle } = require("../config");
const { criarClienteSheets, lerVagas, registrarVagas } = require("../sheets");
const { lerTextoDoc } = require("../google-docs");
const { obterPerfil, perfilParaRadar } = require("../perfil");
const { salvarLote } = require("../lote-arquivo");
const { executarRadar } = require("./index");
const { criarConectoresGithub } = require("./conectores/github");

const ROTULO = { remoto: "Remoto", hibrido: "Híbrido", presencial: "Presencial" };
const MAX_DESCRICAO_SALVA = 6000;

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
 * PF7: com o Doc configurado, a stack e a formação vêm do Perfil; senão, ou se falhar, do RADAR_STACK.
 * @param {any} config
 * @param {any} resultado
 * @param {{ perfil?: import("./tipos").Perfil, lerTexto?: () => Promise<string> }} deps
 * @returns {Promise<import("./tipos").Perfil>}
 */
async function carregarPerfil(config, resultado, deps) {
  if (deps.perfil) return deps.perfil;
  const provisorio = { habilidades: config.radar.stack, formacao: null };

  if (!config.googleDocCvBaseUrl) {
    resultado.avisosPerfil.push("Sem Perfil: defina GOOGLE_DOC_CV_BASE_URL. Usei RADAR_STACK e formação não informada.");
    return provisorio;
  }
  try {
    const { perfil, avisos } = await obterPerfil({
      lerTexto: deps.lerTexto || (() => lerTextoDoc({ docId: extrairIdGoogle(config.googleDocCvBaseUrl), contaDeServico: config.contaDeServico })),
      pastaSaida: config.pastas.saida
    });
    resultado.avisosPerfil.push(...avisos);
    return perfilParaRadar(perfil);
  } catch (erro) {
    resultado.avisosPerfil.push(`Perfil indisponível (${erro instanceof Error ? erro.message : String(erro)}). Usei RADAR_STACK e formação não informada.`);
    return provisorio;
  }
}

/**
 * @param {{ conectores?: import("./tipos").Conector[], clienteSheets?: ReturnType<typeof criarClienteSheets>, hoje?: Date,
 *   perfil?: import("./tipos").Perfil, lerTexto?: () => Promise<string> }} [deps] injeção para testes
 */
function criarEtapaRadar(deps = {}) {
  return async function etapaRadar(/** @type {{ config: any, resultado: any, logs: any }} */ { config, resultado, logs }) {
    const planilhaId = extrairIdGoogle(config.googleSheetUrl);
    const cliente = deps.clienteSheets || criarClienteSheets({ contaDeServico: config.contaDeServico });
    const conectores = deps.conectores
      || criarConectoresGithub({ repos: config.radar.reposGithub, token: config.radar.githubToken });

    const { urlsExistentes } = await lerVagas(cliente, planilhaId);
    const perfil = await carregarPerfil(config, resultado, deps);

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
      titulo: a.vaga.titulo, empresa: a.vaga.empresa || "", url: a.vaga.url, ehVagaDF: a.ehVagaDF, pontos: a.pontos,
      descricao: String(a.vaga.descricao || "").slice(0, MAX_DESCRICAO_SALVA)
    }));
    salvarLote(config, resultado.aprovadas);
    resultado.alertasFormacao = r.lote.flatMap((a) => a.alertas.map((alerta) => `${a.vaga.titulo}: ${alerta}`));
    resultado.falhasConectores = r.falhas;
    resultado.segundaBusca = r.segundaBusca;
    resultado.gravadasNaPlanilha = gravacao.gravado ? gravacao.escritas : 0;
    resultado.pistas.push(...r.pistas);
    resultado.descartes.push(...r.descartes);
  };
}

module.exports = { criarEtapaRadar, paraVagaDaPlanilha };
