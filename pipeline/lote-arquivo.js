// Lote Final salvo em output/lote.json (ignorado pelo Git), para a Etapa `curriculo` poder rodar sozinha (--only-cv)
// com as vagas que o Radar aprovou na última execução. Só texto de vaga pública, nunca dados da Candidata.
const fs = require("node:fs");
const path = require("node:path");

/** @param {{ pastas: { saida: string } }} config */
const caminhoDoLote = (config) => path.join(config.pastas.saida, "lote.json");

/**
 * @param {{ pastas: { saida: string } }} config
 * @param {Record<string, unknown>[]} vagas
 */
function salvarLote(config, vagas) {
  fs.mkdirSync(config.pastas.saida, { recursive: true });
  fs.writeFileSync(caminhoDoLote(config), JSON.stringify({ geradoEm: new Date().toISOString(), vagas }, null, 2), "utf8");
}

/**
 * @param {{ pastas: { saida: string } }} config
 * @returns {Record<string, any>[]}
 */
function lerLote(config) {
  try {
    const dados = JSON.parse(fs.readFileSync(caminhoDoLote(config), "utf8"));
    return Array.isArray(dados.vagas) ? dados.vagas : [];
  } catch {
    return [];
  }
}

module.exports = { salvarLote, lerLote, caminhoDoLote };
