// Manifesto dos currículos: qual PDF foi gerado para qual vaga (por URL). A Etapa candidatura anexa SÓ o PDF da própria vaga (A11).
// Fica em output/cvs/manifesto.json (ignorado pelo Git). Guarda só nome de arquivo e URL pública da vaga.
const fs = require("node:fs");
const path = require("node:path");
const { normalizarUrl } = require("../sheets");

/** @param {{ pastas: { curriculos: string } }} config */
const caminhoDoManifesto = (config) => path.join(config.pastas.curriculos, "manifesto.json");

/** @param {{ pastas: { curriculos: string } }} config @returns {Record<string, string>} */
function lerManifesto(config) {
  try {
    const bruto = JSON.parse(fs.readFileSync(caminhoDoManifesto(config), "utf8"));
    return bruto && typeof bruto === "object" && !Array.isArray(bruto) ? bruto : {};
  } catch {
    return {};
  }
}

/** @param {{ pastas: { curriculos: string } }} config @param {string} url @param {string} arquivo caminho do PDF */
function registrarCv(config, url, arquivo) {
  if (!url) return;
  fs.mkdirSync(config.pastas.curriculos, { recursive: true });
  const manifesto = lerManifesto(config);
  manifesto[normalizarUrl(url)] = path.basename(arquivo);
  fs.writeFileSync(caminhoDoManifesto(config), JSON.stringify(manifesto, null, 2), "utf8");
}

/** Caminho do PDF da vaga, ou null se não existe (nunca devolve o PDF de outra vaga). @param {{ pastas: { curriculos: string } }} config @param {string} url */
function cvDaVaga(config, url) {
  const nome = lerManifesto(config)[normalizarUrl(url)];
  if (!nome || nome !== path.basename(nome)) return null;
  const arquivo = path.join(config.pastas.curriculos, nome);
  return fs.existsSync(arquivo) ? arquivo : null;
}

module.exports = { lerManifesto, registrarCv, cvDaVaga };
