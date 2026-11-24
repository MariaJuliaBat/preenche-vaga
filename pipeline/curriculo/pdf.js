// PDF ATS (CV2): texto selecionável, uma coluna, fonte do sistema, sem tabela, imagem ou ícone.
// `htmlDoCv` é pura e define o documento (HTML + CSS); `gerarPdf` só imprime esse HTML pelo Chrome ou Edge instalado.
const fs = require("node:fs");
const path = require("node:path");
const { abrirNavegador } = require("../navegador");
const { dataJaPassou } = require("../perfil/datas");

/** @param {unknown} texto */
const esc = (texto) => String(texto ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** @param {(string | null | undefined)[]} partes */
const juntar = (partes, separador = " | ") => partes.filter(Boolean).join(separador);

/** URL exata, sem espaço e sem protocolo repetido. @param {string} url */
const limparUrl = (url) => String(url).replace(/\s+/g, "");
/** Texto curto para mostrar um link: sem "https://" e sem "www.". @param {string} url */
const semProtocolo = (url) => limparUrl(url).replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
/** @param {string} url */
const comProtocolo = (url) => (/^https?:\/\//i.test(limparUrl(url)) ? limparUrl(url) : `https://${limparUrl(url)}`);

/** Link clicável; o texto mostrado é a URL sem protocolo (e só o domínio se o caminho for longo). @param {string} url @param {number} [maximo] */
function linkHtml(url, maximo = 48) {
  const curto = semProtocolo(url);
  const mostrado = curto.length > maximo ? `${curto.split("/")[0]}/…` : curto;
  return `<a href="${esc(comProtocolo(url))}">${esc(mostrado)}</a>`;
}

/** Níveis de compactação: o 0 é o layout normal; os seguintes só entram se o currículo passar de 1 página. */
const NIVEIS = [
  { margem: "12mm 14mm 11mm 14mm", fonte: 9.5, linha: 1.32, h2: "9px 0 3px", item: 5 },
  { margem: "10mm 13mm 9mm 13mm", fonte: 9.2, linha: 1.26, h2: "7px 0 2px", item: 4 },
  { margem: "8mm 12mm 8mm 12mm", fonte: 8.8, linha: 1.2, h2: "5px 0 2px", item: 3 },
  { margem: "7mm 11mm 7mm 11mm", fonte: 8.4, linha: 1.15, h2: "4px 0 1px", item: 2 }
];

/** @param {number} [nivel] */
const cssDoNivel = (nivel = 0) => {
  const n = NIVEIS[Math.min(nivel, NIVEIS.length - 1)];
  return `
@page { size: A4; margin: ${n.margem}; }
* { box-sizing: border-box; }
body { margin: 0; color: #1f2933; font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: ${n.fonte}pt; line-height: ${n.linha}; }
a { color: inherit; text-decoration: none; overflow-wrap: anywhere; }
h1 { margin: 0; font-size: 19pt; line-height: 1.15; letter-spacing: 0.2px; color: #111827; }
.headline { margin: 2px 0 0; font-size: 10.5pt; font-weight: 600; color: #374151; }
.contato { margin: 5px 0 0; color: #374151; font-size: 9pt; }
.contato span + span::before { content: "  |  "; color: #9ca3af; white-space: pre; }
.portfolio { margin: 1px 0 0; font-size: 9pt; color: #374151; }
h2 { margin: ${n.h2}; padding-bottom: 2px; border-bottom: 0.75pt solid #d1d5db; font-size: 10.5pt; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #111827; }
p { margin: 0; }
.item { margin: 0 0 ${n.item}px; break-inside: avoid; }
.item.compacto { margin-bottom: 3px; }
/* Cargo, organização e período numa MESMA linha de texto (sem coluna à direita): extratores de texto e ATS que detectam colunas
   por posição não separam mais a data do cargo. */
.linha { break-inside: avoid; }
.cargo { font-weight: 700; color: #111827; }
.org { color: #4b5563; }
.data { color: #4b5563; }
/* O marcador nativo do <li> é desenhado como forma vetorial e some na extração de texto; o "•" abaixo é texto de verdade. */
ul { margin: 2px 0 0; padding: 0; list-style: none; }
li { margin: 0 0 1.5px; padding-left: 13px; text-indent: -10px; }
li::before { content: "•"; display: inline-block; width: 10px; text-indent: 0; }
.links { margin: 2px 0 0; font-size: 9pt; color: #4b5563; }
.links span + span::before { content: "  |  "; color: #9ca3af; white-space: pre; }
.habilidades p { margin: 0 0 1.5px; }
.habilidades b { color: #111827; }
`;
};

/**
 * HTML do currículo. Uma coluna, texto real, listas `<ul><li>` e sem tabela, imagem ou ícone.
 * @param {any} cv resultado de montarConteudo().cv
 * @param {number} [nivel] nível de compactação (0 = normal)
 * @returns {string}
 */
function htmlDoCv(cv, nivel = 0) {
  const id = cv.identificacao;
  /** @type {string[]} */
  const h = [];

  h.push(`<h1>${esc(id.nome || "")}</h1>`);
  if (cv.headline) h.push(`<p class="headline">${esc(cv.headline)}</p>`);

  // Só contatos diretos e perfis profissionais; links de matéria ou repositório ficam com o projeto ou na linha de Portfólio.
  const local = juntar([id.cidade, id.estado], " - ");
  const contatos = [
    id.email && esc(id.email),
    id.telefone && esc(id.telefone),
    local && esc(local),
    id.linkedin && linkHtml(id.linkedin),
    id.github && linkHtml(id.github)
  ].filter(Boolean);
  if (contatos.length) h.push(`<p class="contato">${contatos.map((c) => `<span>${c}</span>`).join("")}</p>`);

  const jaNosItens = new Set([...cv.experiencias, ...cv.projetos].flatMap((/** @type {any} */ b) => (b.item.links || []).map((/** @type {any} */ l) => semProtocolo(l.url))));
  if (id.portfolio && !jaNosItens.has(semProtocolo(id.portfolio))) {
    h.push(`<p class="portfolio"><b>Portfólio / Imprensa:</b> ${linkHtml(id.portfolio, 70)}</p>`);
  }

  if (cv.resumo) h.push(`<h2>Resumo</h2>`, `<p>${esc(cv.resumo)}</p>`);

  /** @param {any} bloco */
  const itemHtml = (bloco) => {
    const { item, topicos } = bloco;
    const cargo = `<span class="cargo">${esc(item.titulo || "")}</span>`;
    // Em projetos, "organização" é a stack; fica em cinza depois do nome, separada por travessão.
    const org = item.organizacao ? ` <span class="org">— ${esc(item.organizacao)}</span>` : "";
    const data = item.periodo ? ` | <span class="data">${esc(item.periodo).replace(/ /g, "&nbsp;")}</span>` : "";
    const lista = topicos.length ? `<ul>${topicos.map((/** @type {string} */ t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "";
    const links = (item.links || []).length
      ? `<p class="links">${item.links.map((/** @type {any} */ l) => `<span>${esc(l.rotulo)}: ${linkHtml(l.url, 60)}</span>`).join("")}</p>`
      : "";
    return `<div class="item${bloco.resumida ? " compacto" : ""}"><div class="linha">${cargo}${org}${data}</div>${lista}${links}</div>`;
  };
  if (cv.experiencias.length) h.push(`<h2>Experiência</h2>`, ...cv.experiencias.map((/** @type {any} */ b) => itemHtml(b)));
  if (cv.projetos.length) h.push(`<h2>Projetos</h2>`, ...cv.projetos.map((/** @type {any} */ b) => itemHtml(b)));

  if (cv.formacao.length) {
    h.push(`<h2>Formação</h2>`);
    for (const f of cv.formacao) {
      const curso = juntar([f.grau, f.curso], " em ");
      const instituicao = juntar([f.instituicao, f.sigla && `(${f.sigla})`], " ");
      // "previsão" só para data que ainda não passou; data passada aparece como está no Doc (ex.: "Jul/2025").
      const data = f.previsaoConclusao ? (dataJaPassou(f.previsaoConclusao) ? f.previsaoConclusao : `previsão ${f.previsaoConclusao}`) : f.status;
      h.push(`<div class="item compacto"><div class="linha"><span class="cargo">${esc(curso || f.instituicao || "")}</span>${curso && instituicao ? ` <span class="org">— ${esc(instituicao)}</span>` : ""}${data ? ` | <span class="data">${esc(data).replace(/ /g, "&nbsp;")}</span>` : ""}</div></div>`);
    }
  }

  if (cv.categorias?.length) {
    h.push(`<h2>Habilidades</h2>`, `<div class="habilidades">${cv.categorias.map((/** @type {any} */ c) => `<p><b>${esc(c.rotulo)}:</b> ${esc(c.itens.join(", "))}</p>`).join("")}</div>`);
  } else if (cv.habilidades.length) {
    h.push(`<h2>Habilidades</h2>`, `<p>${esc(cv.habilidades.join(", "))}</p>`);
  }
  if (cv.idiomas.length) h.push(`<h2>Idiomas</h2>`, `<p>${esc(cv.idiomas.join(", "))}</p>`);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Currículo - ${esc(id.nome || "")}</title><style>${cssDoNivel(nivel)}</style></head><body>${h.join("\n")}</body></html>`;
}

/** Quantidade de páginas de um PDF gerado pelo Chrome. @param {Buffer} pdf */
const paginasDoPdf = (pdf) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-z])/g) || []).length;

/** O PDF só pode ser gerado se houver Chrome ou Edge; os testes usam isto para pular. */
async function navegadorDisponivel() {
  try {
    await (await abrirNavegador()).close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Imprime o HTML em PDF A4 e devolve o caminho. O texto continua selecionável (nada vira imagem).
 * @param {any} cv
 * @param {string} destino
 */
async function gerarPdf(cv, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const navegador = await abrirNavegador();
  try {
    const pagina = await navegador.newPage();
    // O currículo é sempre de 1 página: comprime espaçamento e fonte, nível a nível, até caber.
    /** @type {Buffer | null} */
    let pdf = null;
    for (let nivel = 0; nivel < NIVEIS.length; nivel++) {
      await pagina.setContent(htmlDoCv(cv, nivel), { waitUntil: "load" });
      pdf = await pagina.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
      if (paginasDoPdf(pdf) <= 1) break;
    }
    fs.writeFileSync(destino, /** @type {Buffer} */ (pdf));
  } finally {
    await navegador.close();
  }
  return destino;
}

module.exports = { paginasDoPdf, htmlDoCv, gerarPdf, navegadorDisponivel };
