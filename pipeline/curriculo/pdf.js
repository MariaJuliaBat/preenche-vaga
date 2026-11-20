// PDF ATS (CV2): texto selecionável, uma coluna, fonte do sistema, sem tabela, imagem ou ícone.
// `htmlDoCv` é pura e define o documento (HTML + CSS); `gerarPdf` só imprime esse HTML pelo Chrome ou Edge instalado.
const fs = require("node:fs");
const path = require("node:path");

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

const CSS = `
@page { size: A4; margin: 12mm 14mm 11mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1f2933; font-family: "Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 9.5pt; line-height: 1.32; }
a { color: inherit; text-decoration: none; overflow-wrap: anywhere; }
h1 { margin: 0; font-size: 19pt; line-height: 1.15; letter-spacing: 0.2px; color: #111827; }
.headline { margin: 2px 0 0; font-size: 10.5pt; font-weight: 600; color: #374151; }
.contato { margin: 5px 0 0; color: #374151; font-size: 9pt; }
.contato span + span::before { content: "  |  "; color: #9ca3af; white-space: pre; }
.portfolio { margin: 1px 0 0; font-size: 9pt; color: #374151; }
h2 { margin: 9px 0 3px; padding-bottom: 2px; border-bottom: 0.75pt solid #d1d5db; font-size: 10.5pt; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #111827; }
p { margin: 0; }
.item { margin: 0 0 5px; break-inside: avoid; }
.item.compacto { margin-bottom: 3px; }
/* Cargo, organização e período numa MESMA linha de texto (sem coluna à direita): extratores de texto e ATS que detectam colunas
   por posição não separam mais a data do cargo. */
.linha { break-inside: avoid; }
.cargo { font-weight: 700; color: #111827; }
.org { color: #4b5563; }
.data { white-space: nowrap; color: #4b5563; font-size: 9pt; }
.data::before { content: "  |  "; color: #9ca3af; white-space: pre; }
/* O marcador nativo do <li> é desenhado como forma vetorial e some na extração de texto; o "•" abaixo é texto de verdade. */
ul { margin: 2px 0 0; padding: 0; list-style: none; }
li { margin: 0 0 1.5px; padding-left: 13px; text-indent: -10px; }
li::before { content: "•"; display: inline-block; width: 10px; text-indent: 0; }
.links { margin: 2px 0 0; font-size: 9pt; color: #4b5563; }
.links span + span::before { content: "  |  "; color: #9ca3af; white-space: pre; }
.habilidades p { margin: 0 0 1.5px; }
.habilidades b { color: #111827; }
`;

/**
 * HTML do currículo. Uma coluna, texto real, listas `<ul><li>` e sem tabela, imagem ou ícone.
 * @param {any} cv resultado de montarConteudo().cv
 * @returns {string}
 */
function htmlDoCv(cv) {
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
    const data = item.periodo ? ` <span class="data">${esc(item.periodo)}</span>` : "";
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
      const data = f.previsaoConclusao ? `previsão ${f.previsaoConclusao}` : f.status;
      h.push(`<div class="item compacto"><div class="linha"><span class="cargo">${esc(curso || f.instituicao || "")}</span>${curso && instituicao ? ` <span class="org">— ${esc(instituicao)}</span>` : ""}${data ? ` <span class="data">${esc(data)}</span>` : ""}</div></div>`);
    }
  }

  if (cv.categorias?.length) {
    h.push(`<h2>Habilidades</h2>`, `<div class="habilidades">${cv.categorias.map((/** @type {any} */ c) => `<p><b>${esc(c.rotulo)}:</b> ${esc(c.itens.join(", "))}</p>`).join("")}</div>`);
  } else if (cv.habilidades.length) {
    h.push(`<h2>Habilidades</h2>`, `<p>${esc(cv.habilidades.join(", "))}</p>`);
  }
  if (cv.idiomas.length) h.push(`<h2>Idiomas</h2>`, `<p>${esc(cv.idiomas.join(", "))}</p>`);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Currículo - ${esc(id.nome || "")}</title><style>${CSS}</style></head><body>${h.join("\n")}</body></html>`;
}

/** Caminhos do Chrome ou Edge: PDF_BROWSER_PATH tem prioridade; senão tenta os canais instalados. */
async function abrirNavegador() {
  const { chromium } = require("playwright-core");
  if (process.env.PDF_BROWSER_PATH) return chromium.launch({ executablePath: process.env.PDF_BROWSER_PATH });
  /** @type {unknown} */
  let ultimoErro = null;
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel });
    } catch (erro) {
      ultimoErro = erro;
    }
  }
  throw new Error(`Não achei Chrome nem Edge para gerar o PDF (defina PDF_BROWSER_PATH com o caminho do executável). ${ultimoErro instanceof Error ? ultimoErro.message.split("\n")[0] : ""}`);
}

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
    await pagina.setContent(htmlDoCv(cv), { waitUntil: "load" });
    await pagina.pdf({ path: destino, format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await navegador.close();
  }
  return destino;
}

module.exports = { htmlDoCv, gerarPdf, navegadorDisponivel };
