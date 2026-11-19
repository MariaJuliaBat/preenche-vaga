// Anti-golpe e anti-injeção (RD5 e RD6). Texto de vaga é dado não confiável: aqui só se procura padrão, nunca se obedece.
const { normalizar } = require("./texto");

// Padrões sobre texto normalizado (minúsculas, sem acento).
const SINAIS_DE_GOLPE = [
  /taxa (de |para )?(inscricao|cadastro|treinamento|material|kit|uniforme|admissao|selecao)/,
  /pagamento (antecipado|previo|adiantado)/,
  /(pague|pagar|deposite|depositar|transfira|transferir) .{0,40}(para|pra) (iniciar|comecar|garantir|participar|ser contratad)/,
  /investimento (inicial|obrigatorio)/,
  /(compra|comprar|adquirir|aquisicao) (de |do |um |o )?(curso|treinamento|kit|material)/,
  /curso (obrigatorio )?(pago|com custo)/,
  /dados bancarios/,
  /(senha|token) (do|de) (banco|internet banking|app)/,
  /(chave|codigo) pix/,
  /numero (do|de) cartao/,
  /(envie|enviar|mande|mandar|informe|informar|anexe|anexar) .{0,30}(cpf|rg|cnh|passaporte|foto do documento|documento com foto)/,
  /ganhe dinheiro facil/,
  /renda extra garantida/
];

const INSTRUCOES_SUSPEITAS = [
  /(ignore|ignorar|desconsidere|desconsiderar|esqueca|esquecer) .{0,30}(regras|instrucoes|instrucao|prompt|diretrizes|orientacoes)/,
  /ignore (all|any|the|previous|above|your) .{0,30}(instructions|rules|prompt)/,
  /(aprove|aprovar|selecione|selecionar|marque|marcar) (esta|essa|a) vaga/,
  /(envie|enviar|mande|mandar|encaminhe|encaminhar) (os |seus |suas )?(dados|curriculo|cpf|senha|informacoes) (para|pra|a) /,
  /system prompt/,
  /(voce|vc) (agora )?(e|eh|sera|deve agir como) (um |uma )?(assistente|robo|agente|ia|llm)/,
  /(assistente|robo|agente|ia|llm|bot)( de ia)? (que )?(esta )?(le|lendo|processando|analisando) (este|esse) texto/
];

/**
 * @param {string} texto
 * @param {RegExp[]} padroes
 * @returns {string | null} trecho que bateu (curto) ou null
 */
function achar(texto, padroes) {
  const t = normalizar(texto);
  for (const padrao of padroes) {
    const m = padrao.exec(t);
    if (m) return m[0].slice(0, 80);
  }
  return null;
}

/** @param {string} texto */
const sinalDeGolpe = (texto) => achar(texto, SINAIS_DE_GOLPE);

/** @param {string} texto */
const instrucaoSuspeita = (texto) => achar(texto, INSTRUCOES_SUSPEITAS);

module.exports = { sinalDeGolpe, instrucaoSuspeita };
