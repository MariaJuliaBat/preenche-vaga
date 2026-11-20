// Logs locais do pipeline em JSON Lines (um objeto por linha), dentro de output/logs/ (ignorado pelo Git).
//   descartes.jsonl: vagas recusadas, com o motivo
//   pistas.jsonl:    vagas promissoras sem link individual ou sem data confirmada, para revisão manual
//   pendencias.jsonl: candidaturas pausadas para intervenção humana (escrito pela Etapa candidatura, futura)
const fs = require("node:fs");
const path = require("node:path");

const ARQUIVOS = Object.freeze({ descartes: "descartes.jsonl", pistas: "pistas.jsonl", pendencias: "pendencias.jsonl" });

/**
 * @param {string} pastaLogs
 * @param {keyof typeof ARQUIVOS} tipo
 * @param {Record<string, unknown>} entrada
 */
function registrar(pastaLogs, tipo, entrada) {
  fs.mkdirSync(pastaLogs, { recursive: true });
  const linha = JSON.stringify({ data: new Date().toISOString(), ...entrada });
  fs.appendFileSync(path.join(pastaLogs, ARQUIVOS[tipo]), linha + "\n", "utf8");
}

/**
 * @param {string} pastaLogs
 * @param {keyof typeof ARQUIVOS} tipo
 * @returns {Record<string, unknown>[]}
 */
function ler(pastaLogs, tipo) {
  const arquivo = path.join(pastaLogs, ARQUIVOS[tipo]);
  if (!fs.existsSync(arquivo)) return [];
  return fs.readFileSync(arquivo, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((linha) => JSON.parse(linha));
}

module.exports = { registrar, ler };
