// Pontuação das vagas aprovadas (RD14 a RD16).
const { normalizar, acharTermo } = require("./texto");
const { PESOS, GRUPOS_IA } = require("./pesos");

/**
 * @param {import("./tipos").VagaBruta} vaga
 * @param {{ nivel?: { tipo: string }, local?: { ehVagaDF: boolean }, area?: "dev" | "ti" | null }} classificacao
 * @param {import("./tipos").Perfil} [perfil] a stack vem das habilidades do Perfil
 * @returns {{ pontos: number, ia: string[], stack: string[] }}
 */
function pontuar(vaga, classificacao, perfil = {}) {
  const texto = normalizar(`${vaga.titulo}\n${(vaga.rotulos || []).join(" ")}\n${vaga.descricao || ""}`);

  const ia = Object.entries(GRUPOS_IA)
    .filter(([, termos]) => acharTermo(texto, termos))
    .map(([nome]) => nome);

  const stack = [...new Set((perfil.habilidades || []).map(normalizar).filter(Boolean))]
    .filter((habilidade) => acharTermo(texto, [habilidade]));

  let pontos = ia.length * PESOS.iaAplicada + stack.length * PESOS.termoDaStack;
  if (classificacao.nivel?.tipo === "permitido") pontos += PESOS.nivelExplicito;
  if (classificacao.area === "dev") pontos += PESOS.areaDesenvolvimento;
  if (classificacao.local?.ehVagaDF) pontos += PESOS.vagaDF;
  return { pontos, ia, stack };
}

module.exports = { pontuar };
