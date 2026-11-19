// Etapa "curriculo" da CLI, 100% determinística (sem LLM, sem chave, sem custo): lê o Perfil do Doc e gera um PDF ATS
// sob medida para cada vaga do Lote Final. Falha de uma vaga não derruba as outras (CV7); Doc ou Perfil inválido para a Etapa (P21).
const path = require("node:path");
const { extrairIdGoogle } = require("../config");
const { lerTextoDoc } = require("../google-docs");
const { obterPerfil } = require("../perfil");
const { lerLote } = require("../lote-arquivo");
const { normalizar } = require("../radar/texto");
const { montarConteudo } = require("./conteudo");
const { gerarPdf } = require("./pdf");

/** @param {string} texto */
const slug = (texto) => normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "vaga";

/** A planilha usa "Não informada" quando o Radar não sabe a empresa: não serve para nome de arquivo. @param {string | undefined} empresa */
const empresaConhecida = (empresa) => (empresa && normalizar(empresa) !== "nao informada" ? empresa : "");

/**
 * @param {{ lerTexto?: () => Promise<string> }} [deps] injeção para testes
 */
function criarEtapaCurriculo(deps = {}) {
  return async function etapaCurriculo(/** @type {{ config: any, resultado: any }} */ { config, resultado }) {
    const lerTexto = deps.lerTexto
      || (() => lerTextoDoc({ docId: extrairIdGoogle(config.googleDocCvBaseUrl), contaDeServico: config.contaDeServico }));

    const { perfil, avisos } = await obterPerfil({ lerTexto, pastaSaida: config.pastas.saida });
    resultado.avisosPerfil.push(...avisos);
    resultado.perfilLido = {
      formacoes: perfil.formacao.length,
      experiencias: perfil.experiencias.filter((e) => e.tipo !== "projeto").length,
      projetos: perfil.experiencias.filter((e) => e.tipo === "projeto").length,
      habilidades: perfil.habilidades.tecnicas.length + perfil.habilidades.ferramentas.length,
      idiomas: perfil.habilidades.idiomas.length
    };

    const vagas = resultado.aprovadas.length > 0 ? resultado.aprovadas : lerLote(config);
    if (vagas.length === 0) {
      resultado.avisosPerfil.push("Nenhuma vaga no Lote Final: rode o Radar antes (--only-radar) para gerar currículos.");
      return;
    }

    for (const [i, vaga] of vagas.entries()) {
      try {
        const { cv, avisos: avisosDoCv, palavrasChave } = montarConteudo({ perfil, vaga });
        const empresa = empresaConhecida(vaga.empresa);
        const nome = `${String(i + 1).padStart(2, "0")}-${empresa ? `${slug(empresa)}-` : ""}${slug(vaga.titulo)}.pdf`;
        const arquivo = await gerarPdf(cv, path.join(config.pastas.curriculos, nome));
        resultado.curriculos.push({ titulo: vaga.titulo, arquivo, avisos: avisosDoCv, palavrasChave });
      } catch (erro) {
        resultado.falhasCurriculo.push({ titulo: vaga?.titulo ?? "(vaga inválida)", erro: erro instanceof Error ? erro.message : String(erro) });
      }
    }
  };
}

module.exports = { criarEtapaCurriculo, slug };
