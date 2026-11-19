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

// Remoto restrito a outro país (RD25), sobre texto normalizado. Brasil, LATAM e Worldwide passam.
const PAISES = "us|u\\.s\\.|usa|united states|eu|europe|uk|canada|portugal";
const REMOTO_RESTRITO = [
  new RegExp(`\\b(${PAISES}|australia)[- ]only\\b`),
  /\b(eua|estados unidos|europa|portugal|canada|reino unido)\s+(apenas|somente|only)\b/,
  new RegExp(`\\bmust (reside|live|be located|be based|be a resident) (in|within) (the )?(${PAISES})\\b`),
  /\bmust (reside|be located|be based) in (?!brazil|brasil|latam)/,
  new RegExp(`\\b(work authorization|authorized to work|eligible to work|right to work|work permit) (in|for) (the )?(${PAISES})\\b`),
  /\bwork authorization in\b/,
  /\bresidentes? (nos|na|no|em) (eua|estados unidos|europa|portugal|canada|reino unido)\b/
];
const ABERTO_AO_BRASIL = ["brasil", "brazil", "latam", "latin america", "america latina", "worldwide", "anywhere in the world", "work from anywhere"];

/** @param {string} texto */
const remotoRestritoAOutroPais = (texto) =>
  REMOTO_RESTRITO.some((padrao) => padrao.test(texto)) && !acharTermo(texto, ABERTO_AO_BRASIL);

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
 * @property {string} [detalhe] por que está "fora", quando não é óbvio
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
  if (menc.remoto) {
    if (remotoRestritoAOutroPais(`${curto} | ${longo}`)) {
      return { modalidade: "remoto", ehVagaDF: false, situacao: "fora", detalhe: "remoto restrito a outro país" };
    }
    return { modalidade: "remoto", ehVagaDF: false, situacao: "elegivel" };
  }
  if (menc.hibrido || menc.presencial) {
    return { modalidade: menc.hibrido ? "hibrido" : "presencial", ehVagaDF: false, situacao: "fora" };
  }
  // Só o nome de um lugar no DF, sem modalidade: presencial no DF.
  if (df) return { modalidade: "presencial", ehVagaDF: true, situacao: "elegivel" };
  return { modalidade: null, ehVagaDF: false, situacao: "desconhecido" };
}

module.exports = { REGIOES_DF, detectarLocal };
