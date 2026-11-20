// Reconhecer Campo e escolher valor (A7 a A10). Funções puras: recebem descrições de campos e devolvem decisões.
// Os Sinônimos vêm só de content/mapeamento.js (P24); aqui não há palavra de campo nenhuma, só a regra de casar.
require("../../content/mapeamento.js"); // define globalThis.MAPEAMENTO_CAMPOS, MAPEAMENTO_VALORES e MAPEAMENTO_ACEITES
const { normalizar, escapar } = require("../radar/texto");

const { MAPEAMENTO_CAMPOS, MAPEAMENTO_VALORES, MAPEAMENTO_ACEITES } = /** @type {any} */ (globalThis);

/** Normaliza e troca separadores por espaço. @param {string} t */
const limpar = (t) => normalizar(t).replace(/[_\-./:*()]+/g, " ").replace(/\s+/g, " ").trim();
/** O texto "dataNascimento" também vale como "data nascimento"; "GitHub" continua valendo como "github". @param {string} t @returns {string[]} */
const variantes = (t) => [...new Set([limpar(t), limpar(String(t ?? "").replace(/([a-z])([A-Z])/g, "$1 $2"))])];
/** @param {string} original @param {string} palavra */
const contem = (original, palavra) => variantes(original).some((v) => v !== "" && v.includes(limpar(palavra)));

/**
 * Reconhece o Campo pela ordem label, name, id, placeholder (o primeiro texto que casa vence; dentro dele, a primeira entrada do Mapeamento).
 * @param {string[]} textos
 * @returns {string | null}
 */
function reconhecerCampo(textos) {
  for (const original of textos) {
    if (!limpar(original)) continue;
    const achado = MAPEAMENTO_CAMPOS.find((/** @type {any} */ item) => item.palavras.some((/** @type {string} */ p) => contem(original, p)));
    if (achado) return achado.campo;
  }
  return null;
}

/** O texto é de um Aceite (termos, privacidade, veracidade)? (P26) @param {string[]} textos */
function ehAceite(textos) {
  return textos.some((original) => MAPEAMENTO_ACEITES.some((/** @type {string} */ p) => contem(original, p)));
}

/** @param {string} valor @returns {string[]} formas equivalentes do valor (inclui ele mesmo) */
function formasDoValor(valor) {
  const v = limpar(valor);
  const grupo = MAPEAMENTO_VALORES.find((/** @type {string[]} */ g) => g.map(limpar).includes(v));
  return [...new Set([v, ...(grupo ? grupo.map(limpar) : [])])];
}

/** @param {string} texto @param {string} forma */
const contemPalavra = (texto, forma) => new RegExp(`(^| )${escapar(forma)}( |$)`).test(texto);

/**
 * P25: a ÚNICA opção cujo texto ou valor corresponde ao dado (ou a um sinônimo). Igualdade vence "contém palavra";
 * zero ou mais de uma correspondência devolve null (nunca chuta).
 * @param {{ texto: string, valor: string }[]} opcoes @param {string} dado
 * @returns {number | null} índice da opção
 */
function escolherOpcao(opcoes, dado) {
  const formas = formasDoValor(dado);
  if (formas.length === 0 || !formas[0]) return null;
  const candidatas = opcoes.map((o, i) => ({ i, t: limpar(o.texto), v: limpar(o.valor) })).filter((o) => o.t !== "" || o.v !== "");
  const exatas = candidatas.filter((o) => formas.includes(o.t) || formas.includes(o.v));
  if (exatas.length === 1) return exatas[0].i;
  if (exatas.length > 1) return null;
  const parciais = candidatas.filter((o) => formas.some((f) => f.length >= 3 && (contemPalavra(o.t, f) || contemPalavra(o.v, f))));
  return parciais.length === 1 ? parciais[0].i : null;
}

/**
 * Valores por campo do Mapeamento, a partir do Perfil e dos Dados Complementares. Campo sem dado não aparece (nada é suposto).
 * @param {any} perfil @param {Record<string, string | undefined>} complementares
 * @returns {Record<string, string>}
 */
function montarDados(perfil, complementares) {
  const id = perfil.identificacao;
  const formacao = perfil.formacao[0] || {};
  const experiencia = perfil.experiencias.find((/** @type {any} */ e) => e.tipo !== "projeto") || {};
  /** @type {Record<string, string | null | undefined>} */
  const bruto = {
    nome: id.nome, email: id.email, telefone: id.telefone, cidade: id.cidade, estado: id.estado,
    linkedin: id.linkedin, portfolio: id.portfolio || id.github,
    instituicao: formacao.instituicao, curso: [formacao.grau, formacao.curso].filter(Boolean).join(" em ") || formacao.curso,
    empresa: String(experiencia.organizacao || "").split(" - ")[0].trim() || undefined, cargo: experiencia.titulo,
    habilidades: [...perfil.habilidades.tecnicas, ...perfil.habilidades.ferramentas].join(", "),
    idiomas: perfil.habilidades.idiomas.join(", "),
    ...complementares
  };
  return Object.fromEntries(Object.entries(bruto).filter(([, v]) => typeof v === "string" && v.trim() !== ""));
}

/** AAAA-MM-DD → DD/MM/AAAA. @param {string} iso */
const dataBrasileira = (iso) => iso.split("-").reverse().join("/");

/** Valor no formato que o `input` aceita (date pede ISO; texto, DD/MM/AAAA). @param {string} campo @param {string} valor @param {string} tipo */
function formatarValor(campo, valor, tipo) {
  if (campo === "dataNascimento" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return tipo === "date" ? valor : dataBrasileira(valor);
  return valor;
}

module.exports = { reconhecerCampo, ehAceite, escolherOpcao, montarDados, formatarValor, limpar };
