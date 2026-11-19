// Local Elegível e Vaga DF (RD10 e RD19). Remoto NÃO é Vaga DF.
const { normalizar, acharTermo } = require("./texto");

const REGIOES_DF = Object.freeze([
  "Águas Claras", "Asa Norte", "Asa Sul", "Taguatinga", "Guará", "Sobradinho", "Gama", "Samambaia",
  "Vicente Pires", "Sudoeste", "Noroeste", "Lago Norte", "Lago Sul", "Park Way"
]);

const TERMOS_DF = ["brasilia", "distrito federal", "df", ...REGIOES_DF.map(normalizar)];
// Na descrição longa só vale cidade inequívoca: "Gama" ou "Guará" soltos no texto podem ser outra coisa.
const DF_NA_DESCRICAO = /(brasilia|distrito federal|[,\-/]\s*df\b)/;

const MODALIDADES = {
  hibrido: ["hibrido", "hibrida", "hybrid", "semipresencial"],
  presencial: ["presencial", "on-site", "onsite", "on site"],
  remoto: ["remoto", "remota", "remote", "home office", "home-office", "trabalho remoto", "teletrabalho"]
};

/** @param {string} texto */
function modalidadesEm(texto) {
  return {
    hibrido: Boolean(acharTermo(texto, MODALIDADES.hibrido)),
    presencial: Boolean(acharTermo(texto, MODALIDADES.presencial)),
    remoto: Boolean(acharTermo(texto, MODALIDADES.remoto))
  };
}

/**
 * @typedef {object} LocalDetectado
 * @property {"remoto" | "hibrido" | "presencial" | null} modalidade
 * @property {boolean} ehVagaDF presencial ou híbrida em Brasília - DF ou RA (remoto nunca)
 * @property {"elegivel" | "fora" | "desconhecido"} situacao
 */

/**
 * Decide o local a partir de título, rótulos e campos estruturados; a descrição só entra se esses não disserem a modalidade.
 * @param {import("./tipos").VagaBruta} vaga
 * @returns {LocalDetectado}
 */
function detectarLocal(vaga) {
  const curto = normalizar([vaga.titulo, ...(vaga.rotulos || []), vaga.local, vaga.modalidade].filter(Boolean).join(" | "));
  const longo = normalizar(vaga.descricao);

  let menc = modalidadesEm(curto);
  if (!menc.hibrido && !menc.presencial && !menc.remoto) menc = modalidadesEm(longo);

  const df = Boolean(acharTermo(curto, TERMOS_DF)) || DF_NA_DESCRICAO.test(longo);

  if ((menc.hibrido || menc.presencial) && df) {
    return { modalidade: menc.hibrido ? "hibrido" : "presencial", ehVagaDF: true, situacao: "elegivel" };
  }
  if (menc.remoto) return { modalidade: "remoto", ehVagaDF: false, situacao: "elegivel" };
  if (menc.hibrido || menc.presencial) {
    return { modalidade: menc.hibrido ? "hibrido" : "presencial", ehVagaDF: false, situacao: "fora" };
  }
  // Só o nome de um lugar no DF, sem modalidade: presencial no DF.
  if (df) return { modalidade: "presencial", ehVagaDF: true, situacao: "elegivel" };
  return { modalidade: null, ehVagaDF: false, situacao: "desconhecido" };
}

module.exports = { REGIOES_DF, detectarLocal };
