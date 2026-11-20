// Leitura de output/ para o Dashboard (D7 a D12). Só lê; nunca escreve e nunca toca em .env, secrets/ ou perfil.json.
const fs = require("node:fs");
const path = require("node:path");
const { COTA_DF } = require("../pipeline/radar/pesos");

const LIMITE_DE_LINHAS = 1000;

/**
 * Cota DF sobre o Lote Final (D9, D10). Sem lote ou lote vazio: `semLote`, nunca 0%.
 * @param {{ ehVagaDF?: boolean }[] | null | undefined} vagas
 */
function calcularCota(vagas) {
  if (!Array.isArray(vagas) || vagas.length === 0) {
    return { semLote: true, total: 0, emDF: 0, remotas: 0, percentual: null, cotaNecessaria: 0, atingida: null, meta: COTA_DF };
  }
  const total = vagas.length;
  const emDF = vagas.filter((v) => v?.ehVagaDF).length;
  const cotaNecessaria = Math.ceil(total * COTA_DF);
  return { semLote: false, total, emDF, remotas: total - emDF, percentual: Math.round((emDF / total) * 100), cotaNecessaria, atingida: emDF >= cotaNecessaria, meta: COTA_DF };
}

/** @param {string} arquivo */
function lerJson(arquivo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    return null;
  }
}

/** @param {{ pastas: { saida: string } }} config */
function lerLote(config) {
  const lote = lerJson(path.join(config.pastas.saida, "lote.json"));
  return { geradoEm: lote?.geradoEm || null, vagas: Array.isArray(lote?.vagas) ? lote.vagas : [] };
}

/**
 * PDFs de output/cvs/, mais novo primeiro (D7).
 * @param {{ pastas: { curriculos: string } }} config
 */
function listarCurriculos(config) {
  try {
    return fs.readdirSync(config.pastas.curriculos)
      .filter((nome) => /\.pdf$/i.test(nome))
      .map((nome) => {
        const info = fs.statSync(path.join(config.pastas.curriculos, nome));
        return { nome, tamanho: info.size, geradoEm: info.mtime.toISOString() };
      })
      .sort((a, b) => b.geradoEm.localeCompare(a.geradoEm));
  } catch {
    return [];
  }
}

/**
 * Caminho de um PDF pelo nome, ou null se o nome sair da pasta ou não for .pdf (D8).
 * @param {{ pastas: { curriculos: string } }} config @param {string} nome
 */
function caminhoDoPdf(config, nome) {
  if (!nome || nome !== path.basename(nome) || nome.includes("\\") || !/^[^/\\]+\.pdf$/i.test(nome)) return null;
  const arquivo = path.join(config.pastas.curriculos, nome);
  return fs.existsSync(arquivo) && fs.statSync(arquivo).isFile() ? arquivo : null;
}

const ARQUIVOS_DE_LOG = Object.freeze({ pendencias: "pendencias.jsonl", pistas: "pistas.jsonl", descartes: "descartes.jsonl" });

/**
 * Registros de um log, mais recente primeiro. Arquivo ausente = vazio; linha inválida é ignorada (D11, D12).
 * @param {{ pastas: { logs: string } }} config @param {keyof typeof ARQUIVOS_DE_LOG} tipo
 */
function lerLog(config, tipo) {
  let texto = "";
  try {
    texto = fs.readFileSync(path.join(config.pastas.logs, ARQUIVOS_DE_LOG[tipo]), "utf8");
  } catch {
    return { existe: false, total: 0, registros: [], porMotivo: {} };
  }
  /** @type {Record<string, unknown>[]} */
  const todos = [];
  for (const linha of texto.split("\n")) {
    if (!linha.trim()) continue;
    try {
      const obj = JSON.parse(linha);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) todos.push(obj);
    } catch { /* linha quebrada: ignora */ }
  }
  todos.reverse();
  /** @type {Record<string, number>} */
  const porMotivo = {};
  for (const r of todos) {
    const motivo = String(r.motivo || "sem motivo");
    porMotivo[motivo] = (porMotivo[motivo] || 0) + 1;
  }
  return { existe: true, total: todos.length, registros: todos.slice(0, LIMITE_DE_LINHAS), porMotivo };
}

module.exports = { calcularCota, lerLote, listarCurriculos, caminhoDoPdf, lerLog, ARQUIVOS_DE_LOG };
