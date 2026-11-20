// Etapa "curriculo" da CLI, 100% determinística (sem LLM, sem chave, sem custo): lê o Perfil do Doc e gera um PDF ATS
// sob medida para cada vaga. De onde vêm as vagas (CV1):
//   1. as que o Radar aprovou na mesma execução;
//   2. senão, as linhas da planilha com "Se candidatar" na coluna I e sem "CV gerado" na K (é o que --only-cv sozinho usa);
//   3. sem planilha configurada, o último lote salvo em output/lote.json.
// Falha de uma vaga não derruba as outras (CV7); Doc ou Perfil inválido para a Etapa (P21).
const path = require("node:path");
const { extrairIdGoogle } = require("../config");
const { lerTextoDoc } = require("../google-docs");
const { criarClienteSheets, lerPendentesDeCurriculo, marcarCurriculoGerado } = require("../sheets");
const { obterPerfil } = require("../perfil");
const { lerLote } = require("../lote-arquivo");
const { normalizar } = require("../radar/texto");
const { montarConteudo } = require("./conteudo");
const { obterDescricaoDaVaga } = require("./descricao");
const { gerarPdf } = require("./pdf");
const { registrarCv } = require("./manifesto");

/** @param {string} texto */
const slug = (texto) => normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "vaga";

/** A planilha usa "Não informada" quando o Radar não sabe a empresa: não serve para nome de arquivo. @param {string | undefined} empresa */
const empresaConhecida = (empresa) => (empresa && normalizar(empresa) !== "nao informada" ? empresa : "");

/**
 * @param {{ lerTexto?: () => Promise<string>, clienteSheets?: any, obterDescricao?: (url: string) => Promise<{ titulo?: string, descricao: string } | null> }} [deps] injeção para testes
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

    const planilhaId = config.googleSheetUrl ? extrairIdGoogle(config.googleSheetUrl) : null;
    const cliente = planilhaId ? (deps.clienteSheets || criarClienteSheets({ contaDeServico: config.contaDeServico })) : null;
    const obterDescricao = deps.obterDescricao || ((/** @type {string} */ url) => obterDescricaoDaVaga({ url, config }));

    /** @type {Record<string, any>[]} */
    let vagas;
    if (resultado.aprovadas.length > 0) {
      resultado.fonteDasVagas = "Radar (esta execução)";
      vagas = resultado.aprovadas;
    } else if (cliente && planilhaId) {
      const pendentes = await lerPendentesDeCurriculo(cliente, planilhaId);
      resultado.fonteDasVagas = "planilha (Se candidatar, sem CV gerado)";
      vagas = [];
      for (const linha of pendentes) {
        const achada = await obterDescricao(linha.url);
        if (!achada?.descricao) resultado.avisosPerfil.push(`Sem descrição para "${linha.titulo}": o currículo usa só o título da vaga.`);
        vagas.push({ titulo: linha.titulo, empresa: linha.empresa, url: linha.url, descricao: achada?.descricao || "" });
      }
    } else {
      resultado.fonteDasVagas = "último lote salvo (output/lote.json)";
      vagas = lerLote(config);
    }

    if (vagas.length === 0) {
      resultado.avisosPerfil.push("Nenhuma vaga precisa de currículo agora (na planilha: linhas com \"Se candidatar\" e sem \"CV gerado\"). Rode o Radar antes (--only-radar) para trazer vagas novas.");
      return;
    }

    for (const [i, vaga] of vagas.entries()) {
      try {
        const { cv, avisos: avisosDoCv, palavrasChave } = montarConteudo({ perfil, vaga });
        const empresa = empresaConhecida(vaga.empresa);
        const nome = `${String(i + 1).padStart(2, "0")}-${empresa ? `${slug(empresa)}-` : ""}${slug(vaga.titulo)}.pdf`;
        const arquivo = await gerarPdf(cv, path.join(config.pastas.curriculos, nome));
        resultado.curriculos.push({ titulo: vaga.titulo, arquivo, avisos: avisosDoCv, palavrasChave });
        registrarCv(config, vaga.url, arquivo); // a Etapa candidatura só anexa o PDF desta vaga

        // Marca a coluna K para o --only-cv seguinte não repetir a vaga. Em --dry-run a planilha não é escrita.
        if (cliente && planilhaId && config.escreverPlanilha && vaga.url) {
          const marcada = await marcarCurriculoGerado(cliente, planilhaId, vaga.url);
          if (marcada) resultado.marcadasNaPlanilha += 1;
        }
      } catch (erro) {
        resultado.falhasCurriculo.push({ titulo: vaga?.titulo ?? "(vaga inválida)", erro: erro instanceof Error ? erro.message : String(erro) });
      }
    }
  };
}

module.exports = { criarEtapaCurriculo, slug };
