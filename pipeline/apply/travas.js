// Travas de segurança do Auto-Apply (A15 a A21). Funções puras sobre texto: texto de formulário é DADO, nunca instrução (A18).
const { normalizar } = require("../radar/texto");

/** Instruções dirigidas ao Pipeline escondidas em label, pergunta, opção ou descrição (A19). Já em minúsculas e sem acento. */
const PADROES_DE_INJECAO = [
  /ignor(e|ar|em)\s+(todas?\s+)?(as\s+|a\s+|suas\s+|seus\s+|essas\s+|estas\s+)?(regras|instrucoes|instrucao|orientacoes|diretrizes)/,
  /ignore\s+(all\s+|any\s+)?(previous|prior|above|the|your)\s+(instructions|rules)/,
  /(envie|enviar|mande|mandar|forneca|informe)\s+(os\s+|seus\s+|suas\s+|todos\s+os\s+)?(seus\s+|suas\s+)?(dados|senha|cpf|documentos?)\s+(para|a|ao)\b/,
  /marque\s+todas?\s+(as\s+)?(caixas|opcoes|checkbox)/,
  /voce\s+(deve|precisa)\s+(ignorar|enviar|marcar|aceitar|clicar)/,
  /(system|developer)\s+prompt/,
  /disregard\s+(the\s+|all\s+|any\s+)?(previous|prior|above|rules|instructions)/,
  /(assistente|agente|robo|bot|\bia\b|\bai\b)[,:]?\s+(deve|faca|execute|ignore|marque|envie)/
];

/** Pedidos que nenhuma candidatura legítima faz (A21). Aplicado só aos textos dos campos. */
const PADROES_DE_PEDIDO_SUSPEITO = [
  /dados\s+bancarios|conta\s+bancaria|numero\s+do\s+cartao|cartao\s+de\s+credito|\bcvv\b|chave\s+pix|\bpix\b/,
  /taxa\s+de\s+(inscricao|participacao|selecao)|pagamento\s+(antecipado|da\s+taxa)|credit\s+card|bank\s+account/
];

const PADRAO_CAPTCHA = /nao\s+sou\s+(um\s+)?robo|i'?m\s+not\s+a\s+robot|verificacao\s+de\s+seguranca|confirme\s+que\s+voce\s+e\s+humano|prove\s+que\s+voce\s+e\s+humano|captcha|codigo\s+de\s+verificacao|autenticacao\s+(de\s+dois\s+fatores|em\s+duas\s+etapas)|\b2fa\b/;

/** @param {string[]} textos @returns {string | null} trecho (curto) que parece instrução, ou null */
function acharInjecao(textos) {
  for (const original of textos) {
    const texto = normalizar(original).replace(/\s+/g, " ");
    for (const padrao of PADROES_DE_INJECAO) {
      const achado = padrao.exec(texto);
      if (achado) return texto.slice(Math.max(0, achado.index - 10), achado.index + 70);
    }
  }
  return null;
}

/** @param {string[]} textos @returns {boolean} */
const pedidoSuspeito = (textos) => textos.some((t) => PADROES_DE_PEDIDO_SUSPEITO.some((p) => p.test(normalizar(t))));

/** @param {string} texto */
const falaDeCaptcha = (texto) => PADRAO_CAPTCHA.test(normalizar(texto));

/** Hostname permitido: o da própria vaga ou de um Portal (A20). @param {string} url @param {string[]} dominios */
function hostPermitido(url, dominios) {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return dominios.some((d) => host === d || host.endsWith(`.${d}`));
}

module.exports = { acharInjecao, pedidoSuspeito, falaDeCaptcha, hostPermitido, PADROES_DE_INJECAO };
