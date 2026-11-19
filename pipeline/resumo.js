// Monta o resumo final impresso no terminal. Função pura: recebe números, devolve texto.

/**
 * @typedef {object} ResultadoDaExecucao
 * @property {number} encontradas vagas aprovadas pelo Radar
 * @property {number} emBrasilia presenciais ou híbridas em Brasília - DF
 * @property {number} remotas
 * @property {number} enviadas candidaturas enviadas com sucesso
 * @property {number} pendencias candidaturas pausadas para intervenção humana
 * @property {Record<string, unknown>[]} pistas
 * @property {Record<string, unknown>[]} descartes
 * @property {string[]} etapasNaoImplementadas
 */

/** @returns {ResultadoDaExecucao} */
const resultadoVazio = () => ({
  encontradas: 0,
  emBrasilia: 0,
  remotas: 0,
  enviadas: 0,
  pendencias: 0,
  pistas: [],
  descartes: [],
  etapasNaoImplementadas: []
});

/** @param {ResultadoDaExecucao} r @param {{ dryRun: boolean, enviarCandidatura: boolean }} modo */
function formatarResumo(r, modo) {
  const percentual = r.encontradas > 0 ? Math.round((r.emBrasilia / r.encontradas) * 100) : 0;
  const linhas = [
    "",
    "=== Resumo da execução ===",
    `Modo: ${modo.dryRun ? "dry-run (nada enviado, nada escrito na planilha)" : modo.enviarCandidatura ? "AUTO_SUBMIT ligado" : "AUTO_SUBMIT desligado (preenche, não envia)"}`,
    `Vagas aprovadas pelo Radar: ${r.encontradas}`,
    `  Brasília - DF (presencial/híbrida): ${r.emBrasilia} (${percentual}%)`,
    `  Remotas: ${r.remotas}`,
    `Candidaturas enviadas: ${r.enviadas}`,
    `Pendências (precisam de você): ${r.pendencias}`,
    `Pistas para revisão manual: ${r.pistas.length}`,
    `Vagas descartadas: ${r.descartes.length}`
  ];
  if (r.encontradas > 0 && percentual < 50) {
    linhas.push("ATENÇÃO: menos de 50% das vagas são de Brasília - DF.");
  }
  for (const pista of r.pistas) linhas.push(`  pista: ${pista.titulo || pista.url || "(sem título)"} — ${pista.motivo || ""}`);
  for (const nome of r.etapasNaoImplementadas) linhas.push(`Etapa ainda não implementada: ${nome}`);
  return linhas.join("\n");
}

module.exports = { resultadoVazio, formatarResumo };
