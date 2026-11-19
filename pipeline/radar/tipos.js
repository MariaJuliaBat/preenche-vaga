// Contratos do Radar (só JSDoc; nada executa aqui).

/**
 * Vaga como o Conector entrega: formato comum, sem nenhuma decisão. Texto de vaga é dado não confiável.
 * @typedef {object} VagaBruta
 * @property {string} titulo
 * @property {string} url link individual da vaga ("" se a fonte não tiver)
 * @property {string} [empresa]
 * @property {string} [descricao]
 * @property {string[]} [rotulos] etiquetas da fonte (labels, tags)
 * @property {string} [local] só se a fonte der o local de forma estruturada
 * @property {string} [modalidade] só se a fonte der de forma estruturada: remoto, hibrido ou presencial
 * @property {string} [nivel] só se a fonte der de forma estruturada
 * @property {string} [publicadaEm] data ISO da publicação, se confirmada pela fonte
 * @property {boolean} [encerrada] a fonte diz que a vaga está encerrada
 * @property {string} fonte nome do Conector que a trouxe
 */

/**
 * @typedef {object} Conector
 * @property {string} nome
 * @property {(consulta: { foco: "geral" | "df" }) => Promise<VagaBruta[]>} buscar
 */

/**
 * @typedef {object} Perfil parte do Perfil (P18) que o Radar usa
 * @property {string[]} [habilidades] stack da Candidata
 * @property {{ grau?: string | null } | null} [formacao]
 */

module.exports = {};
