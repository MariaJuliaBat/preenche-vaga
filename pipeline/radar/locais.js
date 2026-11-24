// Local Elegível e Vaga DF (RD10 e RD19). Remoto NÃO é Vaga DF.
const { normalizar, acharTermo } = require("./texto");

const REGIOES_DF = Object.freeze([
  "Águas Claras", "Asa Norte", "Asa Sul", "Taguatinga", "Guará", "Sobradinho", "Gama", "Samambaia",
  "Vicente Pires", "Sudoeste", "Noroeste", "Lago Norte", "Lago Sul", "Park Way"
]);

const TERMOS_DF = ["brasilia", "distrito federal", "df", ...REGIOES_DF.map(normalizar)];
// Na descrição longa só vale cidade inequívoca: "Gama" ou "Guará" soltos no texto podem ser outra coisa.
const DF_NA_DESCRICAO = /(brasilia|distrito federal|[,\-/]\s*df\b)/;

// Lugares fora do DF (RD10): estado ou cidade grande no título, rótulos ou local, sem modalidade remota, descartam a vaga.
// Termos já normalizados. Só entram nomes que quase nunca significam outra coisa ("Natal", "Santos" e "Vitória" ficam de fora).
const ESTADOS_FORA = [
  "acre", "alagoas", "amapa", "amazonas", "bahia", "ceara", "espirito santo", "goias", "maranhao", "mato grosso", "mato grosso do sul",
  "minas gerais", "para", "paraiba", "parana", "pernambuco", "piaui", "rio de janeiro", "rio grande do norte", "rio grande do sul",
  "rondonia", "roraima", "santa catarina", "sao paulo", "sergipe", "tocantins"
].filter((e) => e !== "para"); // "para" é preposição
const CIDADES_FORA = [
  "sao jose do rio preto", "sao jose dos campos", "ribeirao preto", "campinas", "sorocaba", "guarulhos", "osasco", "barueri", "santo andre", "sao bernardo do campo",
  "belo horizonte", "uberlandia", "contagem", "juiz de fora", "niteroi", "curitiba", "londrina", "maringa", "joinville", "blumenau", "florianopolis",
  "porto alegre", "caxias do sul", "salvador", "feira de santana", "recife", "fortaleza", "manaus", "belem", "goiania", "aparecida de goiania", "cuiaba",
  "campo grande", "joao pessoa", "maceio", "aracaju", "teresina", "sao luis", "porto velho", "rio branco", "macapa", "boa vista", "palmas"
];
// Sigla do estado só vale em "Cidade, SP", "Cidade / SP" ou "(SP)"; "- GO" pode ser a linguagem Go, então traço só com as siglas que não são palavra.
const UF_APOS_SEPARADOR = /(?:[,/(]\s*)(ac|al|ap|am|ba|ce|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\s*(?:[)|,/]|$)/;
const UF_APOS_TRACO = /\S\s+-\s+(sp|rj|mg|rs|sc|ba|pe|am|mt|ms|rn|pb|ro|rr|ac|ap)\s*(?:[)|,/]|$)/;

/** Primeiro lugar fora do DF citado no texto normalizado, ou null. @param {string} texto */
function lugarForaDoDF(texto) {
  const nome = acharTermo(texto, [...CIDADES_FORA, ...ESTADOS_FORA]);
  if (nome) return nome;
  const uf = UF_APOS_SEPARADOR.exec(texto) || UF_APOS_TRACO.exec(texto);
  return uf ? uf[1].toUpperCase() : null;
}

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
  // Sem remoto explícito: cidade ou estado de fora do DF no título, rótulos ou local descarta a vaga.
  const lugar = df ? null : lugarForaDoDF(curto);
  if (lugar) {
    return { modalidade: menc.hibrido ? "hibrido" : menc.presencial ? "presencial" : null, ehVagaDF: false, situacao: "fora", detalhe: `fora do DF: ${lugar}` };
  }
  if (menc.hibrido || menc.presencial) {
    return { modalidade: menc.hibrido ? "hibrido" : "presencial", ehVagaDF: false, situacao: "fora" };
  }
  // Só o nome de um lugar no DF, sem modalidade: presencial no DF.
  if (df) return { modalidade: "presencial", ehVagaDF: true, situacao: "elegivel" };
  return { modalidade: null, ehVagaDF: false, situacao: "desconhecido" };
}

module.exports = { REGIOES_DF, detectarLocal };
