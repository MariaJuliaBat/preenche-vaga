// Partes comuns dos Conectores de busca por termo (Gupy, LinkedIn, Indeed). O Conector só traduz a fonte para Vaga Bruta:
// não filtra, não pontua (RD1). Texto da fonte é dado não confiável e nunca é seguido como instrução.

/** Termos de busca para Estágio de TI e Júnior. */
const TERMOS_DE_BUSCA = Object.freeze([
  "estágio TI",
  "estágio tecnologia",
  "estágio desenvolvimento",
  "estágio programação",
  "desenvolvedor júnior",
  "analista de suporte estágio"
]);

/** Pausa entre requisições: educação com a fonte, e menos chance de limite de uso. @param {number} ms */
const pausar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Erro de bloqueio da fonte (limite de uso, verificação anti-robô). O Radar NÃO tenta contornar: relata e segue com as outras fontes. */
class FonteBloqueada extends Error {}

const ENTIDADES = /** @type {Record<string, string>} */ ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " });

/** Texto simples de um trecho de HTML: sem tags, com entidades comuns resolvidas e espaços normalizados. @param {string} html */
function textoDoHtml(html) {
  return String(html ?? "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(b|i|u|em|strong|span|a|font|small|sup|sub|mark)\b[^>]*>/gi, "") // formatação em linha não separa palavras
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (inteira, nome) => {
      if (nome[0] === "#") {
        const codigo = nome[1].toLowerCase() === "x" ? Number.parseInt(nome.slice(2), 16) : Number.parseInt(nome.slice(1), 10);
        return Number.isFinite(codigo) && codigo > 0 && codigo < 0x110000 ? String.fromCodePoint(codigo) : " ";
      }
      return ENTIDADES[nome.toLowerCase()] ?? inteira;
    })
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { TERMOS_DE_BUSCA, pausar, FonteBloqueada, textoDoHtml };
