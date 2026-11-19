// Etapa "curriculo" da CLI: extrai o Perfil do Doc (com Cache) e gera um PDF ATS sob medida para cada vaga do Lote Final.
// Falha de uma vaga não derruba as outras (CV7); Doc ou Perfil inválido para a Etapa (P21).
const path = require("node:path");
const { extrairIdGoogle } = require("../config");
const { lerTextoDoc } = require("../google-docs");
const { criarLlm } = require("../llm");
const { obterPerfil } = require("../perfil");
const { lerLote } = require("../lote-arquivo");
const { normalizar } = require("../radar/texto");
const { gerarConteudo } = require("./conteudo");
const { gerarPdf } = require("./pdf");

/** @param {string} texto */
const slug = (texto) => normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "vaga";

/**
 * @param {{ llm?: import("../llm").Llm, lerTexto?: () => Promise<string> }} [deps] injeção para testes
 */
function criarEtapaCurriculo(deps = {}) {
  return async function etapaCurriculo(/** @type {{ config: any, resultado: any }} */ { config, resultado }) {
    const llm = deps.llm || criarLlm({ apiKey: config.anthropicApiKey, modelo: config.anthropicModel || undefined });
    const lerTexto = deps.lerTexto
      || (() => lerTextoDoc({ docId: extrairIdGoogle(config.googleDocCvBaseUrl), contaDeServico: config.contaDeServico }));

    const { perfil, avisos } = await obterPerfil({ lerTexto, llm, pastaSaida: config.pastas.saida });
    resultado.avisosPerfil.push(...avisos);

    const vagas = resultado.aprovadas.length > 0 ? resultado.aprovadas : lerLote(config);
    if (vagas.length === 0) {
      resultado.avisosPerfil.push("Nenhuma vaga no Lote Final: rode o Radar antes (--only-radar) para gerar currículos.");
      return;
    }

    for (const [i, vaga] of vagas.entries()) {
      try {
        const { cv, avisos: avisosDoCv } = await gerarConteudo({ perfil, vaga, llm });
        const nome = `${String(i + 1).padStart(2, "0")}-${slug(vaga.empresa || vaga.titulo)}-${slug(vaga.titulo)}.pdf`;
        const arquivo = await gerarPdf(cv, path.join(config.pastas.curriculos, nome));
        resultado.curriculos.push({ titulo: vaga.titulo, arquivo, avisos: avisosDoCv });
      } catch (erro) {
        resultado.falhasCurriculo.push({ titulo: vaga.titulo, erro: erro instanceof Error ? erro.message : String(erro) });
      }
    }
  };
}

module.exports = { criarEtapaCurriculo, slug };
