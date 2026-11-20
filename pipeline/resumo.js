// Monta o resumo final impresso no terminal. Função pura: recebe números, devolve texto.

/**
 * @typedef {object} ResultadoDaExecucao
 * @property {number} encontradas vagas do Lote Final aprovado pelo Radar
 * @property {number} emBrasilia presenciais ou híbridas em Brasília - DF
 * @property {number} remotas
 * @property {number} enviadas candidaturas enviadas com sucesso
 * @property {number} pendencias candidaturas pausadas para intervenção humana
 * @property {number} simuladas candidaturas preenchidas em --dry-run (nada enviado)
 * @property {{ titulo: string, resultado: string, motivos: string[], portal: string }[]} candidaturas resultado de cada Tentativa da Etapa candidatura
 * @property {Record<string, unknown>[]} pistas
 * @property {Record<string, unknown>[]} descartes
 * @property {{ titulo: string, empresa: string, url: string, ehVagaDF: boolean, pontos: number }[]} aprovadas
 * @property {string[]} alertasFormacao
 * @property {{ conector: string, foco: string, erro: string }[]} falhasConectores
 * @property {{ total: number, emBrasilia: number, remotas: number, porFonte: Record<string, number> } | null} aprovadasNoTotal tudo que passou na classificação, antes do corte do lote
 * @property {{ conector: string, foco: string, vagas: number }[]} fontesDoRadar quantas vagas cada fonte que respondeu entregou, por busca
 * @property {boolean} segundaBusca o Radar precisou da segunda busca focada no DF
 * @property {number} gravadasNaPlanilha
 * @property {{ titulo: string, arquivo: string, avisos: string[], palavrasChave?: { casadas: string[], lacunas: string[] } }[]} curriculos PDFs sob medida gerados
 * @property {{ formacoes: number, experiencias: number, projetos: number, habilidades: number, idiomas: number } | null} perfilLido o que o parser leu do Currículo Base (só contagens)
 * @property {{ titulo: string, erro: string }[]} falhasCurriculo vagas cujo currículo não foi gerado
 * @property {string} fonteDasVagas de onde a Etapa curriculo tirou as vagas (Radar, planilha ou lote salvo)
 * @property {number} marcadasNaPlanilha linhas da planilha marcadas com "CV gerado"
 * @property {string[]} avisosPerfil avisos do Perfil (Ancoragem, Perfil indisponível etc.)
 * @property {string[]} etapasRodadas etapas que rodaram nesta execução (o resumo só mostra o bloco do Radar se ele rodou)
 * @property {string[]} etapasNaoImplementadas
 */

/** @returns {ResultadoDaExecucao} */
const resultadoVazio = () => ({
  encontradas: 0,
  emBrasilia: 0,
  remotas: 0,
  enviadas: 0,
  pendencias: 0,
  simuladas: 0,
  candidaturas: [],
  pistas: [],
  descartes: [],
  aprovadas: [],
  alertasFormacao: [],
  falhasConectores: [],
  fontesDoRadar: [],
  aprovadasNoTotal: null,
  segundaBusca: false,
  gravadasNaPlanilha: 0,
  curriculos: [],
  perfilLido: null,
  fonteDasVagas: "",
  marcadasNaPlanilha: 0,
  falhasCurriculo: [],
  avisosPerfil: [],
  etapasRodadas: [],
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
  // Sem lista de etapas (chamada direta), mostra tudo; com ela, o bloco do Radar só aparece se o Radar rodou.
  const mostraRadar = r.etapasRodadas.length === 0 || r.etapasRodadas.includes("radar");
  const linhas = [
    "",
    "=== Resumo da execução ===",
    `Modo: ${modo.dryRun ? "dry-run (nada enviado, nada escrito na planilha)" : modo.enviarCandidatura ? "AUTO_SUBMIT ligado" : "AUTO_SUBMIT desligado (preenche, não envia)"}`
  ];
  if (mostraRadar) {
    linhas.push(
      `Vagas aprovadas pelo Radar: ${r.encontradas}`,
      `  Brasília - DF (presencial/híbrida): ${r.emBrasilia} (${percentual}%)`,
      `  Remotas: ${r.remotas}`
    );
  }
  for (const a of mostraRadar ? r.aprovadas : []) {
    linhas.push(`  - ${a.titulo}${a.empresa ? ` (${a.empresa})` : ""} — ${a.ehVagaDF ? "Brasília - DF" : "Remota"}, ${a.pontos} pts`);
  }
  if (mostraRadar && r.segundaBusca) linhas.push("  (segunda busca focada em Brasília - DF foi necessária)");
  if (mostraRadar) {
    linhas.push(
      `Linhas gravadas na planilha: ${r.gravadasNaPlanilha}`,
      `Candidaturas enviadas: ${r.enviadas}`,
      `Pendências (precisam de você): ${r.pendencias}`,
      `Pistas para revisão manual: ${r.pistas.length}`,
      `Vagas descartadas: ${r.descartes.length}${r.descartes.length > 0 ? ` (${contarPorMotivo(r.descartes)})` : ""}`
    );
  }
  if (mostraRadar && r.encontradas > 0 && percentual < 50) {
    linhas.push("ATENÇÃO: abaixo de 50% DF: menos de 50% das vagas são de Brasília - DF (nenhuma vaga presencial de outra cidade foi incluída).");
  }
  if (mostraRadar && r.aprovadasNoTotal) {
    const t = r.aprovadasNoTotal;
    linhas.push(`Aprovadas na classificação (antes do corte do lote): ${t.total} (Brasília - DF ${t.emBrasilia}, remotas ${t.remotas}); por fonte: ${Object.entries(t.porFonte).map(([nome, n]) => `${nome} ${n}`).join(", ") || "nenhuma"}`);
  }
  if (mostraRadar && r.fontesDoRadar.length > 0) {
    /** @type {Record<string, number>} */
    const porFonte = {};
    for (const c of r.fontesDoRadar) porFonte[c.conector] = (porFonte[c.conector] || 0) + c.vagas;
    linhas.push(`Fontes que responderam: ${Object.entries(porFonte).map(([nome, n]) => `${nome} ${n}`).join(", ")}`);
  }
  for (const f of r.falhasConectores) linhas.push(`Falha no Conector ${f.conector} (busca ${f.foco}): ${f.erro}`);
  for (const alerta of r.alertasFormacao) linhas.push(`Alerta de formação — ${alerta}`);
  for (const pista of r.pistas) linhas.push(`  pista: ${pista.titulo || pista.url || "(sem título)"} — ${pista.motivo || ""}`);
  if (r.perfilLido) {
    const p = r.perfilLido;
    linhas.push(`Perfil lido do Currículo Base: ${p.formacoes} formação(ões), ${p.experiencias} experiência(s), ${p.projetos} projeto(s), ${p.habilidades} habilidade(s), ${p.idiomas} idioma(s)`);
  }
  if (r.curriculos.length > 0 || r.falhasCurriculo.length > 0) {
    linhas.push(`Currículos sob medida gerados: ${r.curriculos.length}${r.fonteDasVagas ? ` (vagas: ${r.fonteDasVagas})` : ""}`);
    if (r.marcadasNaPlanilha > 0) linhas.push(`Linhas da planilha marcadas como "CV gerado": ${r.marcadasNaPlanilha}`);
    for (const c of r.curriculos) {
      linhas.push(`  - ${c.titulo} → ${c.arquivo}`);
      if (c.palavrasChave) linhas.push(`      palavras-chave da vaga que você tem: ${c.palavrasChave.casadas.join(", ") || "(nenhuma)"}`);
      for (const aviso of c.avisos) linhas.push(`      aviso: ${aviso}`);
    }
    for (const falha of r.falhasCurriculo) linhas.push(`Falha ao gerar currículo para "${falha.titulo}": ${falha.erro}`);
  }
  if (r.candidaturas.length > 0) {
    linhas.push(`Candidatura: ${r.enviadas} enviada(s), ${r.pendencias} pendência(s), ${r.simuladas} simulada(s)`);
    for (const c of r.candidaturas) linhas.push(`  - ${c.titulo} [${c.portal}] → ${c.resultado}${c.motivos.length > 0 ? ` (${c.motivos.join("; ")})` : ""}`);
  }
  for (const aviso of r.avisosPerfil) linhas.push(`Aviso do Perfil: ${aviso}`);
  for (const nome of r.etapasNaoImplementadas) linhas.push(`Etapa ainda não implementada: ${nome}`);
  return linhas.join("\n");
}

module.exports = { resultadoVazio, formatarResumo };
