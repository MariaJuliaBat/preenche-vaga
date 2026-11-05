// Monta, em memória, um .docx FICTÍCIO para os testes (um .docx é um zip de XMLs).
// Nunca coloque aqui, nem em nenhum arquivo do repositório, um currículo real.
const zlib = require("node:zlib");

function crc32(dados) {
  let crc = 0xffffffff;
  for (const byte of dados) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// arquivos: { "caminho/no/zip": "conteúdo texto" }
function montarZip(arquivos, metodo = 8) {
  const locais = [];
  const centrais = [];
  let deslocamento = 0;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const nomeBuf = Buffer.from(nome);
    const dados = Buffer.from(conteudo, "utf8");
    const gravados = metodo === 8 ? zlib.deflateRawSync(dados) : dados;
    const crc = crc32(dados);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(gravados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    locais.push(local, nomeBuf, gravados);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(gravados.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, nomeBuf);

    deslocamento += 30 + nomeBuf.length + gravados.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

const escapar = (texto) => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const paragrafo = (texto) => `<w:p><w:r><w:t xml:space="preserve">${escapar(texto)}</w:t></w:r></w:p>`;

const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

// linhas: texto simples ou { xml: "<w:p>...</w:p>" }; relacoes: { rId1: "https://..." }
function montarDocx(linhas, relacoes = {}, metodo = 8) {
  const corpo = linhas.map((linha) => (typeof linha === "string" ? paragrafo(linha) : linha.xml)).join("");
  const rels = Object.entries(relacoes)
    .map(([id, alvo]) => `<Relationship Id="${id}" Type="hyperlink" Target="${escapar(alvo)}" TargetMode="External"/>`)
    .join("");
  return montarZip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": `<?xml version="1.0"?><w:document ${NS}><w:body>${corpo}</w:body></w:document>`,
    "word/_rels/document.xml.rels": `<Relationships>${rels}</Relationships>`
  }, metodo);
}

// Converte um Buffer do Node no ArrayBuffer que o popup recebe de File.arrayBuffer().
const paraArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);

// Currículo fictício, com a mesma estrutura de um currículo real:
// cabeçalho com contatos e links, seções, CAIXA ALTA e período entre parênteses.
const LINHA_REDES = {
  xml: "<w:p><w:r><w:t xml:space=\"preserve\">Redes Profissionais: </w:t></w:r>"
    + "<w:hyperlink r:id=\"rId1\"><w:r><w:t>LinkedIn</w:t></w:r></w:hyperlink>"
    + "<w:r><w:t xml:space=\"preserve\"> | </w:t></w:r>"
    + "<w:hyperlink r:id=\"rId2\"><w:r><w:t>GitHub</w:t></w:r></w:hyperlink></w:p>"
};

const CURRICULO_DOCX_FICTICIO = [
  "ANA SOUZA",
  "Celular: (11) 99999-0000 | E-mail: ana@exemplo.com | São Paulo - SP",
  LINHA_REDES,
  "Objetivo",
  "Atuar na área de dados com foco em impacto social.",
  "Resumo",
  "Desenvolvedora Full-Stack & estudante de Computação. Experiência com APIs em Node.js.",
  "Educação",
  "GRADUAÇÃO EM COMPUTAÇÃO (BACHARELADO) - UNIVERSIDADE EXEMPLO - SP (Previsão de conclusão em 2028)",
  "FORMAÇÃO EM DESENVOLVIMENTO WEB FULL-STACK (720 horas) - Escola Exemplo (Julho de 2023 - Julho de 2024)",
  "Tecnologias: JavaScript, Node.JS e React.JS.",
  "Experiência Profissional",
  "Analista de Dados - Empresa Exemplo | Maio 2025 - Atual",
  "Análise de indicadores e construção de painéis.",
  "Estagiária - Instituto Teste | Janeiro 2024 - Dezembro 2024",
  "Apoio ao time de suporte.",
  "Projetos",
  "Projeto Exemplo: API REST para um blog com Node.js e Express.",
  "Habilidades Técnicas e Idiomas",
  "Tecnologias: HTML, CSS, JavaScript, Python.",
  "Idiomas: Inglês (Intermediário - prática com conversação); Francês (Básico)",
  "Cursos e Certificações",
  "Curso de Dados (60h) - Instituto Teste (2025)"
];

const RELACOES_FICTICIAS = {
  rId1: "https://www.linkedin.com/in/anasouza",
  rId2: "https://github.com/anasouza-exemplo"
};

module.exports = { montarDocx, montarZip, paraArrayBuffer, CURRICULO_DOCX_FICTICIO, RELACOES_FICTICIAS };
