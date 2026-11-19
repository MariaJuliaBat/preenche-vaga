// PDF ATS (CV2): texto selecionável, uma coluna, fonte padrão, sem tabela, imagem ou ícone.
// `linhasDoCv` é pura e define o conteúdo; `gerarPdf` só desenha essas linhas.
const fs = require("node:fs");
const path = require("node:path");

/** @param {(string | null | undefined)[]} partes */
const juntar = (partes, separador = " | ") => partes.filter(Boolean).join(separador);

/**
 * @param {any} cv resultado de validarConteudo
 * @returns {{ tipo: "nome" | "contato" | "secao" | "titulo" | "texto" | "topico", texto: string }[]}
 */
function linhasDoCv(cv) {
  const id = cv.identificacao;
  /** @type {{ tipo: "nome" | "contato" | "secao" | "titulo" | "texto" | "topico", texto: string }[]} */
  const linhas = [];
  linhas.push({ tipo: "nome", texto: id.nome || "" });
  const local = juntar([id.cidade, id.estado], " - ");
  // Sem "https://" nos links: o texto fica mais curto e continua legível para o ATS.
  const semProtocolo = (/** @type {string | null} */ url) => (url ? url.replace(/^https?:\/\/(www\.)?/, "") : url);
  const contato = juntar([id.email, id.telefone, local, semProtocolo(id.linkedin), semProtocolo(id.github), semProtocolo(id.portfolio)]);
  if (contato) linhas.push({ tipo: "contato", texto: contato });

  if (cv.resumo) linhas.push({ tipo: "secao", texto: "Resumo" }, { tipo: "texto", texto: cv.resumo });

  /** @param {any[]} itens */
  const blocoDeItens = (itens) => {
    for (const { item, topicos } of itens) {
      linhas.push({ tipo: "titulo", texto: juntar([item.titulo, item.organizacao, item.periodo]) });
      for (const t of topicos) linhas.push({ tipo: "topico", texto: t });
    }
  };
  if (cv.experiencias.length) {
    linhas.push({ tipo: "secao", texto: "Experiência" });
    blocoDeItens(cv.experiencias);
  }
  if (cv.projetos.length) {
    linhas.push({ tipo: "secao", texto: "Projetos" });
    blocoDeItens(cv.projetos);
  }
  if (cv.formacao.length) {
    linhas.push({ tipo: "secao", texto: "Formação" });
    for (const f of cv.formacao) {
      linhas.push({
        tipo: "titulo",
        texto: juntar([juntar([f.grau, f.curso], " em "), f.instituicao, f.status, f.previsaoConclusao ? `previsão ${f.previsaoConclusao}` : null])
      });
    }
  }
  if (cv.habilidades.length) linhas.push({ tipo: "secao", texto: "Habilidades" }, { tipo: "texto", texto: cv.habilidades.join(", ") });
  if (cv.idiomas.length) linhas.push({ tipo: "secao", texto: "Idiomas" }, { tipo: "texto", texto: cv.idiomas.join(", ") });
  return linhas;
}

/**
 * Desenha o PDF e devolve o caminho. Fonte Helvetica (padrão do PDF), A4, uma coluna.
 * @param {any} cv
 * @param {string} destino
 * @param {{ comprimir?: boolean }} [opcoes]
 */
function gerarPdf(cv, destino, opcoes = {}) {
  const PDFDocument = require("pdfkit");
  fs.mkdirSync(path.dirname(destino), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 42, bottom: 42, left: 46, right: 46 },
      compress: opcoes.comprimir !== false,
      info: { Title: `Currículo - ${cv.identificacao.nome || ""}`, Author: cv.identificacao.nome || "" }
    });
    const arquivo = fs.createWriteStream(destino);
    arquivo.on("finish", () => resolve(destino));
    arquivo.on("error", reject);
    doc.on("error", reject);
    doc.pipe(arquivo);

    for (const linha of linhasDoCv(cv)) {
      switch (linha.tipo) {
        case "nome": doc.font("Helvetica-Bold").fontSize(17).text(linha.texto); break;
        case "contato": doc.font("Helvetica").fontSize(9).text(linha.texto).moveDown(0.5); break;
        case "secao":
          doc.moveDown(0.6).font("Helvetica-Bold").fontSize(11).text(linha.texto.toUpperCase());
          doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).lineWidth(0.5).stroke();
          doc.moveDown(0.3);
          break;
        case "titulo": doc.moveDown(0.2).font("Helvetica-Bold").fontSize(10).text(linha.texto); break;
        case "topico": doc.font("Helvetica").fontSize(10).text(`- ${linha.texto}`, { indent: 8 }); break;
        default: doc.font("Helvetica").fontSize(10).text(linha.texto);
      }
    }
    doc.end();
  });
}

module.exports = { linhasDoCv, gerarPdf };
