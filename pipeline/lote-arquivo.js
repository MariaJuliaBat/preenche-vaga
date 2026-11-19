// Vagas do Radar salvas em output/ (ignorado pelo Git), para a Etapa `curriculo` rodar sozinha (--only-cv):
//   lote.json  o Lote Final da última execução do Radar
//   vagas.json texto de todas as vagas já aprovadas, por URL (a planilha guarda o link, mas não a descrição)
// Só texto de vaga pública, nunca dados da Candidata.
const fs = require("node:fs");
const path = require("node:path");
const { normalizarUrl } = require("./sheets");

/** @param {{ pastas: { saida: string } }} config */
const caminhoDoLote = (config) => path.join(config.pastas.saida, "lote.json");
/** @param {{ pastas: { saida: string } }} config */
const caminhoDasVagas = (config) => path.join(config.pastas.saida, "vagas.json");

/** @param {string} arquivo @param {any} padrao */
function lerJson(arquivo, padrao) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    return padrao;
  }
}

/**
 * Salva o lote da última execução e acrescenta as vagas ao cache por URL.
 * @param {{ pastas: { saida: string } }} config
 * @param {Record<string, any>[]} vagas
 */
function salvarLote(config, vagas) {
  fs.mkdirSync(config.pastas.saida, { recursive: true });
  fs.writeFileSync(caminhoDoLote(config), JSON.stringify({ geradoEm: new Date().toISOString(), vagas }, null, 2), "utf8");

  const cache = lerJson(caminhoDasVagas(config), {});
  for (const v of vagas) if (v?.url) cache[normalizarUrl(v.url)] = { titulo: v.titulo, empresa: v.empresa, url: v.url, descricao: v.descricao };
  fs.writeFileSync(caminhoDasVagas(config), JSON.stringify(cache, null, 2), "utf8");
}

/**
 * @param {{ pastas: { saida: string } }} config
 * @returns {Record<string, any>[]}
 */
function lerLote(config) {
  const dados = lerJson(caminhoDoLote(config), {});
  return Array.isArray(dados.vagas) ? dados.vagas : [];
}

/**
 * Vaga já vista pelo Radar (com a descrição), pela URL.
 * @param {{ pastas: { saida: string } }} config
 * @param {string} url
 * @returns {Record<string, any> | null}
 */
function lerVagaSalva(config, url) {
  return lerJson(caminhoDasVagas(config), {})[normalizarUrl(url)] || null;
}

module.exports = { salvarLote, lerLote, lerVagaSalva, caminhoDoLote };
