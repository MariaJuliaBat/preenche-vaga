// Testes da importação do currículo em .docx (R6, R7) e do preenchimento com os dados importados (R2).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const {
  montarDocx, montarZip, paraArrayBuffer, CURRICULO_DOCX_FICTICIO, RELACOES_FICTICIAS
} = require("./docx-falso.js");

const raiz = path.join(__dirname, "..");
const lerCodigo = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), "utf8");
const codigoImportador = lerCodigo("popup/importar-docx.js");
const mapeamento = lerCodigo("content/mapeamento.js");
const preencher = lerCodigo("content/preencher.js");

// Roda o importador num contexto com as APIs que o navegador oferece.
function carregarImportador() {
  const contexto = vm.createContext({
    Blob, Response, DecompressionStream, TextDecoder, DataView, Uint8Array, Map, Set, RegExp, Number, Error, String
  });
  vm.runInContext(codigoImportador, contexto);
  return contexto.ImportarDocx;
}

const importarFicticio = async (metodo = 8) => {
  const docx = montarDocx(CURRICULO_DOCX_FICTICIO, RELACOES_FICTICIAS, metodo);
  const resultado = await carregarImportador().importar(paraArrayBuffer(docx));
  // Os objetos nascem no contexto isolado (vm); o JSON os traz para o mundo do teste.
  return JSON.parse(JSON.stringify(resultado));
};

test("Importar lê contato, links e seções do .docx (R6)", async () => {
  const { completo } = await importarFicticio();
  assert.strictEqual(completo.nome, "Ana Souza");
  assert.strictEqual(completo.email, "ana@exemplo.com");
  assert.strictEqual(completo.telefone, "(11) 99999-0000");
  assert.strictEqual(completo.cidade, "São Paulo");
  assert.strictEqual(completo.estado, "SP");
  assert.strictEqual(completo.linkedin, "https://www.linkedin.com/in/anasouza");
  assert.strictEqual(completo.github, "https://github.com/anasouza-exemplo");
  assert.strictEqual(completo.objetivo, "Atuar na área de dados com foco em impacto social.");
  assert.match(completo.resumo, /Full-Stack & estudante de Computação/);
});

test("Importar lê formação, com CAIXA ALTA suavizada e período separado (R6)", async () => {
  const { completo } = await importarFicticio();
  assert.strictEqual(completo.educacao.length, 2);
  assert.deepStrictEqual(
    { curso: completo.educacao[0].curso, instituicao: completo.educacao[0].instituicao, periodo: completo.educacao[0].periodo },
    { curso: "Graduação em Computação (Bacharelado)", instituicao: "Universidade Exemplo", periodo: "Previsão de conclusão em 2028" }
  );
  assert.strictEqual(completo.educacao[1].curso, "Formação em Desenvolvimento Web Full-Stack (720 horas)");
  assert.strictEqual(completo.educacao[1].instituicao, "Escola Exemplo");
  assert.deepStrictEqual(completo.educacao[1].detalhes, ["Tecnologias: JavaScript, Node.JS e React.JS."]);
});

test("Importar lê experiências, projetos, habilidades, idiomas e cursos (R6)", async () => {
  const { completo } = await importarFicticio();
  assert.strictEqual(completo.experiencias.length, 2);
  assert.deepStrictEqual(completo.experiencias[0], {
    cargo: "Analista de Dados",
    empresa: "Empresa Exemplo",
    inicio: "Maio 2025",
    fim: "Atual",
    atual: true,
    descricao: "Análise de indicadores e construção de painéis."
  });
  assert.strictEqual(completo.experiencias[1].atual, false);
  assert.deepStrictEqual(completo.projetos, [
    { nome: "Projeto Exemplo", descricao: "API REST para um blog com Node.js e Express." }
  ]);
  assert.deepStrictEqual(completo.habilidades, ["HTML", "CSS", "JavaScript", "Python"]);
  assert.deepStrictEqual(completo.idiomas, [
    { idioma: "Inglês", nivel: "Intermediário" },
    { idioma: "Francês", nivel: "Básico" }
  ]);
  assert.deepStrictEqual(completo.cursos, ["Curso de Dados (60h) - Instituto Teste (2025)"]);
});

test("Importar também lê .docx guardado sem compressão (R6)", async () => {
  const { completo } = await importarFicticio(0);
  assert.strictEqual(completo.email, "ana@exemplo.com");
});

test("Arquivo que não é .docx devolve uma mensagem clara e nada é importado (R7)", async () => {
  const importador = carregarImportador();
  await assert.rejects(
    importador.importar(paraArrayBuffer(Buffer.from("isto é um texto qualquer, não um zip"))),
    /não parece ser um \.docx/
  );
});

test(".docx sem o texto do currículo devolve mensagem clara (R7)", async () => {
  const zip = montarZip({ "[Content_Types].xml": "<Types/>" });
  await assert.rejects(carregarImportador().importar(paraArrayBuffer(zip)), /Não encontrei o texto/);
  const vazio = montarDocx([]);
  await assert.rejects(carregarImportador().importar(paraArrayBuffer(vazio)), /vazio/);
});

test("Currículo sem seções conhecidas não quebra e ainda acha nome e e-mail (R6)", async () => {
  const docx = montarDocx(["Beatriz Lima", "beatriz@exemplo.com | (21) 98888-7777", "Texto livre sem títulos."]);
  const { completo, campos } = await carregarImportador().importar(paraArrayBuffer(docx));
  assert.strictEqual(completo.nome, "Beatriz Lima");
  assert.strictEqual(completo.email, "beatriz@exemplo.com");
  assert.strictEqual(completo.telefone, "(21) 98888-7777");
  assert.strictEqual(completo.experiencias.length, 0);
  assert.strictEqual(campos.cargo, undefined, "campo sem dado não vira string vazia");
});

test("Do .docx ao formulário: os dados importados preenchem os Campos (R2, R6)", async () => {
  const { campos } = await importarFicticio();
  const dom = new JSDOM(
    `<!doctype html><body><form>
       <label for="n">Nome completo</label><input id="n">
       <label for="e">E-mail</label><input id="e">
       <label for="t">Telefone</label><input id="t">
       <label for="c">Cidade</label><input id="c">
       <label for="l">LinkedIn</label><input id="l">
       <label for="r">Resumo profissional</label><textarea id="r"></textarea>
       <label for="cu">Curso</label><input id="cu">
       <label for="i">Instituição de ensino</label><input id="i">
       <label for="ca">Cargo atual</label><input id="ca">
       <label for="em">Nome da empresa</label><input id="em">
       <label for="h">Habilidades</label><textarea id="h"></textarea>
       <label for="id">Idiomas</label><input id="id">
     </form></body>`,
    { runScripts: "outside-only" }
  );
  dom.window.CURRICULO = campos;
  dom.window.eval(mapeamento);
  const total = dom.window.eval(preencher);
  const valor = (id) => dom.window.document.getElementById(id).value;

  assert.strictEqual(total, 12);
  assert.strictEqual(valor("n"), "Ana Souza");
  assert.strictEqual(valor("e"), "ana@exemplo.com");
  assert.strictEqual(valor("t"), "(11) 99999-0000");
  assert.strictEqual(valor("c"), "São Paulo");
  assert.strictEqual(valor("l"), "https://www.linkedin.com/in/anasouza");
  assert.match(valor("r"), /^Desenvolvedora Full-Stack/);
  assert.strictEqual(valor("cu"), "Graduação em Computação (Bacharelado)");
  assert.strictEqual(valor("i"), "Universidade Exemplo");
  assert.strictEqual(valor("ca"), "Analista de Dados");
  assert.strictEqual(valor("em"), "Empresa Exemplo", "\"Nome da empresa\" recebe a empresa, não o nome da Candidata");
  assert.strictEqual(valor("h"), "HTML, CSS, JavaScript, Python");
  assert.strictEqual(valor("id"), "Inglês (Intermediário), Francês (Básico)");
});

test("O Currículo não fica na memória da aba depois de Preencher (privacidade)", () => {
  const dom = new JSDOM(`<!doctype html><body><label for="n">Nome</label><input id="n"></body>`, { runScripts: "outside-only" });
  dom.window.CURRICULO = { nome: "Ana Souza" };
  dom.window.eval(mapeamento);
  dom.window.eval(preencher);
  assert.strictEqual(dom.window.document.getElementById("n").value, "Ana Souza");
  assert.strictEqual(dom.window.CURRICULO, undefined);
});

test("O importador nunca Envia nem aciona botões (R1)", () => {
  assert.doesNotMatch(codigoImportador, /\.(submit|requestSubmit|click)\s*\(/);
});

test("O importador não faz chamadas de rede: o currículo não sai do navegador (R6)", () => {
  assert.doesNotMatch(codigoImportador, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\b/);
});
