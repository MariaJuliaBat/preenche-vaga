// Classificação de uma Vaga Bruta: Descarte, Pista ou aprovada (RD5 a RD13). Função pura, sem rede.
// Ordem: segurança, encerrada, vigência, nível, área, local, remuneração; só então Pistas
// (uma vaga que seria descartada nunca vira Pista) e, por fim, aprovada.
const { normalizar, acharTermo } = require("./texto");
const { sinalDeGolpe, instrucaoSuspeita } = require("./seguranca");
const { detectarLocal } = require("./locais");

const DIA_MS = 24 * 60 * 60 * 1000;

const NIVEIS_BLOQUEADOS_FORTES = ["tech lead", "techlead", "lider tecnico", "lider tecnica", "coordenador", "coordenadora", "gerente", "especialista", "head", "staff", "principal", "arquiteto", "arquiteta"];
const NIVEIS_BLOQUEADOS = ["pleno", "plena", "senior", "sr", "pl"];
const NIVEIS_PERMITIDOS = ["estagio", "estagiario", "estagiaria", "junior", "jr", "trainee"];

const TERMOS_AREA = [
  "desenvolvedor", "desenvolvedora", "desenvolvimento", "developer", "dev", "programador", "programadora", "engenheiro de software", "engenheira de software", "software engineer", "product engineer", "ai engineer", "ml engineer", "data engineer", "platform engineer", "engenheiro de dados", "engenheira de dados",
  "software", "frontend", "front-end", "front end", "backend", "back-end", "back end", "fullstack", "full stack", "full-stack", "mobile",
  "devops", "sre", "qa", "quality assurance", "analista de sistemas", "analista de testes", "analista de dados", "dados", "data", "ti", "tecnologia",
  "react", "node", "nodejs", "python", "javascript", "typescript", "java", "cloud", "machine learning", "inteligencia artificial", "ia"
];

const ENCERRADA = /(vaga|processo seletivo|inscricoes|candidaturas) (esta |foi )?(encerrad[oa]s?|fechad[oa]s?|preenchid[oa]s?|finalizad[oa]s?)/;
const NAO_REMUNERADA = /(voluntari[oa]|nao remunerad[oa]|sem remuneracao|trabalho gratuito)/;
const EXCECAO_BOLSA = /(bolsa|iniciacao cientifica|pibic|pibit|pesquisa academica|pesquisa cientifica)/;
const EXIGE_BACHARELADO = /(bacharel|bacharelado)/;
const EXIGE_TECNOLOGO = /(tecnologo|tecnologa|superior de tecnologia)/;
const ACEITA_LICENCIATURA = /licenciatura/;

/**
 * @param {import("./tipos").VagaBruta} vaga
 * @returns {{ tipo: "permitido" | "bloqueado" | "desconhecido", termo: string | null }}
 */
function detectarNivel(vaga) {
  const campo = normalizar([vaga.titulo, vaga.nivel, ...(vaga.rotulos || [])].filter(Boolean).join(" | "));
  const forte = acharTermo(campo, NIVEIS_BLOQUEADOS_FORTES);
  if (forte) return { tipo: "bloqueado", termo: forte };
  const permitido = acharTermo(campo, NIVEIS_PERMITIDOS);
  // "Júnior/Pleno" serve para quem é Júnior, então a vaga fica.
  if (permitido) return { tipo: "permitido", termo: permitido };
  const bloqueado = acharTermo(campo, NIVEIS_BLOQUEADOS);
  if (bloqueado) return { tipo: "bloqueado", termo: bloqueado };
  return { tipo: "desconhecido", termo: null };
}

/** @param {import("./tipos").VagaBruta} vaga */
function ehDeTecnologia(vaga) {
  const campo = normalizar([vaga.titulo, vaga.nivel, ...(vaga.rotulos || [])].filter(Boolean).join(" | "));
  if (acharTermo(campo, TERMOS_AREA)) return true;
  // Título sem pista: precisa de pelo menos dois termos fortes na descrição.
  const longo = normalizar(vaga.descricao);
  const fortes = ["desenvolvedor", "desenvolvimento de software", "programacao", "javascript", "python", "react", "node", "typescript", "java", "api"];
  return fortes.filter((t) => acharTermo(longo, [t])).length >= 2;
}

/**
 * Link individual: URL http(s) com caminho além da raiz (a home de um site não é uma vaga).
 * @param {string} url
 */
function temLinkIndividual(url) {
  try {
    const u = new URL(String(url || "").trim());
    return /^https?:$/.test(u.protocol) && u.pathname.replace(/\/+$/, "") !== "";
  } catch {
    return false;
  }
}

/** @param {unknown} valor @returns {Date | null} */
function lerData(valor) {
  if (!valor) return null;
  const d = new Date(String(valor));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * RD13: exigência de grau diferente do Perfil vira alerta, nunca descarte.
 * @param {import("./tipos").VagaBruta} vaga
 * @param {import("./tipos").Perfil} perfil
 * @returns {string[]}
 */
function alertasDeFormacao(vaga, perfil) {
  const texto = normalizar(`${vaga.titulo} ${vaga.descricao || ""}`);
  const grauDoPerfil = perfil?.formacao?.grau || "";
  const grau = normalizar(grauDoPerfil);
  const dizOGrau = grauDoPerfil ? `formação no Perfil: ${grauDoPerfil}` : "formação do Perfil não informada";
  const alertas = [];
  if (EXIGE_BACHARELADO.test(texto) && !ACEITA_LICENCIATURA.test(texto) && !grau.includes("bachar")) {
    alertas.push(`Formação: vaga cita Bacharelado; ${dizOGrau}`);
  }
  if (EXIGE_TECNOLOGO.test(texto) && !ACEITA_LICENCIATURA.test(texto) && !grau.includes("tecnolog")) {
    alertas.push(`Formação: vaga cita Tecnólogo; ${dizOGrau}`);
  }
  return alertas;
}

/**
 * @typedef {object} Classificacao
 * @property {"aprovada" | "descarte" | "pista"} resultado
 * @property {string} [motivo]
 * @property {string} [detalhe]
 * @property {ReturnType<typeof detectarNivel>} [nivel]
 * @property {ReturnType<typeof detectarLocal>} [local]
 * @property {string[]} [alertas]
 */

/**
 * @param {import("./tipos").VagaBruta} vaga
 * @param {{ hoje: Date, vigenciaDias: number, perfil?: import("./tipos").Perfil }} ctx
 * @returns {Classificacao}
 */
function classificar(vaga, ctx) {
  const textoCompleto = `${vaga.titulo}\n${(vaga.rotulos || []).join(" ")}\n${vaga.descricao || ""}`;
  /** @param {string} motivo @param {string} [detalhe] @returns {Classificacao} */
  const descarte = (motivo, detalhe) => ({ resultado: "descarte", motivo, detalhe });
  /** @param {string} motivo @returns {Classificacao} */
  const pista = (motivo) => ({ resultado: "pista", motivo });

  const golpe = sinalDeGolpe(textoCompleto);
  if (golpe) return descarte("sinal de golpe", golpe);
  const suspeito = instrucaoSuspeita(textoCompleto);
  if (suspeito) return descarte("texto suspeito", suspeito);

  if (vaga.encerrada || ENCERRADA.test(normalizar(textoCompleto))) return descarte("encerrada");

  const data = lerData(vaga.publicadaEm);
  if (data) {
    const dias = Math.floor((ctx.hoje.getTime() - data.getTime()) / DIA_MS);
    if (dias > ctx.vigenciaDias) return descarte("antiga", `${dias} dias`);
  }

  const nivel = detectarNivel(vaga);
  if (nivel.tipo === "bloqueado") return descarte("nível", nivel.termo || "");

  if (!ehDeTecnologia(vaga)) return descarte("área");

  const local = detectarLocal(vaga);
  if (local.situacao === "fora") return descarte("local", local.detalhe || local.modalidade || "");

  const texto = normalizar(textoCompleto);
  if (NAO_REMUNERADA.test(texto) && !EXCECAO_BOLSA.test(texto)) return descarte("não remunerada");

  // Só agora as Pistas: a vaga passou em tudo, mas não dá para confirmar.
  if (!temLinkIndividual(vaga.url)) return pista("sem link individual");
  if (!data) return pista("sem data de publicação");
  if (nivel.tipo === "desconhecido") return pista("nível não identificado");
  if (local.situacao === "desconhecido") return pista("local não informado");

  return { resultado: "aprovada", nivel, local, alertas: alertasDeFormacao(vaga, ctx.perfil || {}) };
}

module.exports = { classificar, detectarNivel, alertasDeFormacao, temLinkIndividual };
