// Etapa "candidatura" da CLI (docs/specs/auto-apply.md). Para cada vaga da planilha com "Se candidatar":
// abre a página com a Sessão da Candidata, preenche, anexa o PDF DESTA vaga e só envia se AUTO_SUBMIT=true fora do --dry-run
// e sem nenhuma trava (A22). Pendência guarda a prova em output/receipts/ e o motivo em output/logs/pendencias.jsonl.
// Uma vaga com problema não derruba as outras (A29).
const path = require("node:path");
const { extrairIdGoogle } = require("../config");
const { lerTextoDoc } = require("../google-docs");
const { criarClienteSheets, lerVagasParaCandidatar, atualizarCandidatura } = require("../sheets");
const { obterPerfil } = require("../perfil");
const { lerComplementares } = require("../perfil/complementares");
const { cvDaVaga } = require("../curriculo/manifesto");
const { slug } = require("../curriculo/etapa");
const { montarDados } = require("./campos");
const { candidatarNaPagina } = require("./motor");
const { PORTAIS, portalDaUrl, abrirContextoPersistente } = require("./sessao");

/** Caminho relativo à pasta de saída, com "/": nada do diretório do usuário vai para a planilha (A26). */
const relativoASaida = (/** @type {any} */ config, /** @type {string} */ arquivo) =>
  path.join(path.basename(config.pastas.saida), path.relative(config.pastas.saida, arquivo)).split(path.sep).join("/");

/** @param {{ motivo: string, campo?: string }[]} motivos */
const resumoDosMotivos = (motivos) => motivos.map((m) => (m.campo ? `${m.motivo} (${m.campo})` : m.motivo)).join("; ");

/**
 * @param {{
 *   lerTexto?: () => Promise<string>,
 *   clienteSheets?: any,
 *   abrir?: (o: { pasta: string, visivel: boolean }) => Promise<any>,
 *   candidatar?: typeof candidatarNaPagina,
 *   lerComplementares?: typeof lerComplementares
 * }} [deps] injeção para testes
 */
function criarEtapaCandidatura(deps = {}) {
  return async function etapaCandidatura(/** @type {{ config: any, resultado: any, logs: any, saida?: (t: string) => void }} */ { config, resultado, logs, saida }) {
    const lerTexto = deps.lerTexto
      || (() => lerTextoDoc({ docId: extrairIdGoogle(config.googleDocCvBaseUrl), contaDeServico: config.contaDeServico }));
    const { perfil, avisos } = await obterPerfil({ lerTexto, pastaSaida: config.pastas.saida }); // P21: sem Perfil, a Etapa para
    resultado.avisosPerfil.push(...avisos);

    const complementares = (deps.lerComplementares || lerComplementares)(config.dadosComplementares);
    if (!complementares.existe) resultado.avisosPerfil.push("Sem secrets/dados-complementares.json: CPF, nascimento etc. ficam vazios e campos obrigatórios viram Pendência.");
    const dados = montarDados(perfil, complementares.dados);

    const planilhaId = extrairIdGoogle(config.googleSheetUrl);
    const cliente = deps.clienteSheets || criarClienteSheets({ contaDeServico: config.contaDeServico });
    const vagas = await lerVagasParaCandidatar(cliente, planilhaId);
    if (vagas.length === 0) {
      resultado.avisosPerfil.push("Nenhuma vaga com \"Se candidatar\" na planilha para a candidatura.");
      return;
    }

    const dominiosDosPortais = Object.values(PORTAIS).flatMap((p) => p.dominios);
    const candidatar = deps.candidatar || candidatarNaPagina;
    const visivel = !config.apply.headless;
    const contexto = await (deps.abrir || abrirContextoPersistente)({ pasta: config.pastas.sessaoNavegador, visivel, ...(config.navegador?.executavel ? { executavel: config.navegador.executavel } : {}) });
    let abertasComPendencia = 0;

    try {
      for (const [i, vaga] of vagas.entries()) {
        const portal = portalDaUrl(vaga.url);
        /** @type {import("./motor").ResultadoDaPagina} */
        let r;
        let pagina = null;
        const cv = cvDaVaga(config, vaga.url);
        try {
          pagina = await contexto.newPage();
          await pagina.goto(vaga.url, { waitUntil: "domcontentloaded", timeout: 30000 });
          await pagina.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
          const hostDaVaga = new URL(vaga.url).hostname.toLowerCase();
          r = await candidatar(pagina, {
            dados,
            cvPath: cv,
            enviar: config.enviarCandidatura,
            dryRun: config.dryRun,
            recibo: { pasta: config.pastas.recibos, base: `${String(i + 1).padStart(2, "0")}-${slug(vaga.titulo)}` },
            dominiosPermitidos: [hostDaVaga, ...dominiosDosPortais]
          });
        } catch (erro) {
          // Nunca coloca o texto do erro no log: pode citar o que a página tinha. Só o tipo do problema.
          r = { resultado: "pendencia", motivos: [{ motivo: erro instanceof Error && /timeout|net::|navigation/i.test(erro.message) ? "página não abriu" : "erro ao preencher a página" }], preenchidos: 0, recibo: null, protocolo: null };
        }

        const recibo = r.recibo ? relativoASaida(config, r.recibo) : null;
        const cvRelativo = cv ? relativoASaida(config, cv) : null;
        const motivos = resumoDosMotivos(r.motivos);
        resultado.candidaturas.push({ titulo: vaga.titulo, resultado: r.resultado, motivos: r.motivos.map((m) => m.motivo), portal: portal || "formulário web" });

        if (r.resultado === "enviada") {
          resultado.enviadas += 1;
          if (config.escreverPlanilha) await atualizarCandidatura(cliente, planilhaId, vaga.url, { enviada: true, status: "Candidatura enviada - CV adaptado", cv: cvRelativo, recibo });
        } else if (r.resultado === "simulada") {
          resultado.simuladas += 1; // A27: nada de planilha nem de log de Pendência
        } else {
          resultado.pendencias += 1;
          if (config.escreverPlanilha) {
            logs.registrar(config.pastas.logs, "pendencias", {
              titulo: vaga.titulo, url: vaga.url, fonte: portal ? PORTAIS[/** @type {keyof typeof PORTAIS} */ (portal)].nome : "formulário web",
              motivo: r.motivos[0]?.motivo || "pendência", detalhe: r.motivos.map((m) => m.campo).filter(Boolean).join(", "),
              motivos: r.motivos, recibo
            });
            await atualizarCandidatura(cliente, planilhaId, vaga.url, { enviada: false, status: `Pendência: ${motivos}`.slice(0, 300), cv: cvRelativo, recibo });
          }
        }

        // Pendência com janela visível: a aba fica aberta para a Candidata terminar à mão (aceite, pergunta aberta...).
        if (r.resultado === "pendencia" && visivel && !config.dryRun) abertasComPendencia += 1;
        else await pagina?.close().catch(() => {});
      }

      if (abertasComPendencia > 0) {
        // Avisa ANTES de esperar: o resumo final só sai depois que a janela fechar.
        (saida || console.log)(`${abertasComPendencia} aba(s) com Pendência ficaram abertas: termine à mão e FECHE a janela do navegador para encerrar.`);
        await new Promise((resolve) => { contexto.on("close", resolve); if (contexto.pages().length === 0) resolve(undefined); });
      }
    } finally {
      await contexto.close().catch(() => {});
    }
  };
}

module.exports = { criarEtapaCandidatura, relativoASaida };
