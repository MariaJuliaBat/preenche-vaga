// Pesos da Pontuação (RD16): um único lugar. A Pontuação só ordena, nunca descarta (RD14).
const PESOS = Object.freeze({
  iaAplicada: 5,       // por grupo de termos de IA aplicada encontrado
  termoDaStack: 2,     // por habilidade do Perfil encontrada
  nivelExplicito: 1,   // Estágio, Júnior ou Trainee explícito
  areaDesenvolvimento: 3, // desenvolvimento, automação e IA sobem no ranking; as demais áreas de TI (suporte, infra, dados...) só passam
  vagaDF: 2            // presencial ou híbrida em Brasília - DF sobe no ranking
});

// Cada grupo conta uma vez, mesmo que o texto cite vários sinônimos. Termos já normalizados.
const GRUPOS_IA = Object.freeze({
  "prompt engineering": ["prompt engineering", "engenharia de prompt"],
  "spec-driven development": ["spec-driven development", "spec driven development", "spec-driven", "sdd"],
  "claude": ["claude code", "claude"],
  "cursor": ["cursor"],
  "copilot": ["github copilot", "copilot"],
  "automação com IA": ["automacao com ia", "automacoes com ia", "automacao com inteligencia artificial", "automacoes com inteligencia artificial"],
  "IA aplicada": ["ia aplicada", "ia generativa", "llm", "llms", "agentes de ia", "ai agents"]
});

/** Cota mínima de Vagas DF no Lote Final. */
const COTA_DF = 0.5;

module.exports = { PESOS, GRUPOS_IA, COTA_DF };
