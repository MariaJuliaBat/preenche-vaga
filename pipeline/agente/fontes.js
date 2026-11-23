// Fontes locais do Agente: o Lote Final e o Perfil em output/ (ambos fora do Git). Somente leitura.
const fs = require("node:fs");
const path = require("node:path");

/** @param {string} arquivo */
function lerJson(arquivo) {
  try { return JSON.parse(fs.readFileSync(arquivo, "utf8")); } catch { return null; }
}

/** Vagas do Lote Final (cache local da última busca do Radar). @param {string} pastaSaida */
function lerVagasLocais(pastaSaida) {
  const lote = lerJson(path.join(pastaSaida, "lote.json"));
  return Array.isArray(lote?.vagas) ? lote.vagas : [];
}

/** Perfil validado pelo Pipeline (output/perfil.json), ou null. @param {string} pastaSaida */
function lerPerfilLocal(pastaSaida) {
  const p = lerJson(path.join(pastaSaida, "perfil.json"))?.perfil;
  return p?.habilidades && Array.isArray(p.experiencias) ? p : null;
}

/**
 * A10: o que o modelo pode ver do Perfil. Sem nome, e-mail, telefone, links pessoais nem qualquer dado de cadastro:
 * só cidade e estado, formação, experiências e habilidades.
 * @param {any} perfil
 */
function perfilSeguro(perfil) {
  const id = perfil?.identificacao || {};
  return {
    local: [id.cidade, id.estado].filter(Boolean).join(" - ") || null,
    formacao: (perfil?.formacao || []).map((/** @type {any} */ f) => ({ curso: f.curso, grau: f.grau, status: f.status, previsaoConclusao: f.previsaoConclusao })),
    experiencias: (perfil?.experiencias || []).map((/** @type {any} */ e) => ({ tipo: e.tipo, titulo: e.titulo, organizacao: e.organizacao, periodo: e.periodo, descricao: e.descricao, tecnologias: e.tecnologias })),
    habilidades: perfil?.habilidades || { tecnicas: [], ferramentas: [], idiomas: [] }
  };
}

module.exports = { lerVagasLocais, lerPerfilLocal, perfilSeguro };
