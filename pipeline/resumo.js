// Monta o resumo final impresso no terminal. Função pura: recebe números, devolve texto.

/**
 * @typedef {object} ResultadoDaExecucao
 * @property {number} encontradas vagas do Lote Final aprovado pelo Radar
 * @property {number} emBrasilia presenciais ou híbridas em Brasília - DF
 * @property {number} remotas
 * @property {number} enviadas candidaturas enviadas com sucesso
 * @property {number} pendencias candidaturas pausadas para intervenção humana
 * @property {Record<string, unknown>[]} pistas
 * @property {Record<string, unknown>[]} descartes
 * @property {{ titulo: string, empresa: string, url: string, ehVagaDF: boolean, pontos: number }[]} aprovadas
 * @property {string[]} alertasFormacao
 * @property {{ conector: string, foco: string, erro: string }[]} falhasConectores
 * @property {boolean} segundaBusca o Radar precisou da segunda busca focada no DF
 * @property {number} gravadasNaPlanilha
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
  aprovadas: [],
  alertasFormacao: [],
  falhasConectores: [],
  segundaBusca: false,
  gravadasNaPlanilha: 0,
  etapasNaoImplementadas: []
});

/** @param {Record<string, unknown>[]} descartes */
function contarPorMotivo(descartes) {
  /** @type {Record<string, number>} */
  const contagem = {};
  for (const d of descartes) {
    const motivo = String(d.motivo || "sem motivo");
    contagem[motivo] = (contagem[motivo] || 0) + 1;
  }
  return Object.entries(contagem).map(([motivo, n]) => `${motivo} ${n}`).join(", ");
}

/** @param {ResultadoDaExecucao} r @param {{ dryRun: boolean, enviarCandidatura: boolean }} modo */
function formatarResumo(r, modo) {
  const percentual = r.encontradas > 0 ? Math.round((r.emBrasilia / r.encontradas) * 100) : 0;
  const linhas = [
    "",
    "=== Resumo da execução ===",
    `Modo: ${modo.dryRun ? "dry-run (nada enviado, nada escrito na planilha)" : modo.enviarCandidatura ? "AUTO_SUBMIT ligado" : "AUTO_SUBMIT desligado (preenche, não envia)"}`,
    `Vagas aprovadas pelo Radar: ${r.encontradas}`,
    `  Brasília - DF (presencial/híbrida): ${r.emBrasilia} (${percentual}%)`,
    `  Remotas: ${r.remotas}`
  ];
  for (const a of r.aprovadas) {
    linhas.push(`  - ${a.titulo}${a.empresa ? ` (${a.empresa})` : ""} — ${a.ehVagaDF ? "Brasília - DF" : "Remota"}, ${a.pontos} pts`);
  }
  if (r.segundaBusca) linhas.push("  (segunda busca focada em Brasília - DF foi necessária)");
  linhas.push(
    `Linhas gravadas na planilha: ${r.gravadasNaPlanilha}`,
    `Candidaturas enviadas: ${r.enviadas}`,
    `Pendências (precisam de você): ${r.pendencias}`,
    `Pistas para revisão manual: ${r.pistas.length}`,
    `Vagas descartadas: ${r.descartes.length}${r.descartes.length > 0 ? ` (${contarPorMotivo(r.descartes)})` : ""}`
  );
  if (r.encontradas > 0 && percentual < 50) {
    linhas.push("ATENÇÃO: abaixo de 50% DF: menos de 50% das vagas são de Brasília - DF (nenhuma vaga presencial de outra cidade foi incluída).");
  }
  for (const f of r.falhasConectores) linhas.push(`Falha no Conector ${f.conector} (busca ${f.foco}): ${f.erro}`);
  for (const alerta of r.alertasFormacao) linhas.push(`Alerta de formação — ${alerta}`);
  for (const pista of r.pistas) linhas.push(`  pista: ${pista.titulo || pista.url || "(sem título)"} — ${pista.motivo || ""}`);
  for (const nome of r.etapasNaoImplementadas) linhas.push(`Etapa ainda não implementada: ${nome}`);
  return linhas.join("\n");
}

module.exports = { resultadoVazio, formatarResumo };
