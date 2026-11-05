// Testes dos cenários BDD de docs/specs/preenchimento-automatico.md
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const raiz = path.join(__dirname, "..");
const lerCodigo = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), "utf8");
const mapeamento = lerCodigo("content/mapeamento.js");
const preencher = lerCodigo("content/preencher.js");

// Monta uma página com o HTML dado, roda os scripts da extensão e devolve a página.
function carregar(html) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: "outside-only" });
  dom.window.eval(mapeamento);
  dom.window.eval(preencher);
  return dom.window.document;
}

test("Preencher Campos reconhecidos sem Enviar (R1, R2)", () => {
  let enviado = false;
  const dom = new JSDOM(
    `<!doctype html><body><form>
       <label for="a">Nome completo</label><input id="a">
       <label for="b">E-MAIL</label><input id="b">
       <button type="submit">Enviar candidatura</button>
     </form></body>`,
    { runScripts: "outside-only" }
  );
  dom.window.document.querySelector("form").addEventListener("submit", () => { enviado = true; });
  dom.window.document.querySelector("button").addEventListener("click", () => { enviado = true; });
  dom.window.eval(mapeamento);
  dom.window.eval(preencher);

  const doc = dom.window.document;
  assert.strictEqual(doc.getElementById("a").value, "Ana Souza");
  assert.strictEqual(doc.getElementById("b").value, "ana@exemplo.com");
  assert.strictEqual(enviado, false, "a candidatura não pode ser enviada");
});

test("Nunca chama .submit() nem .click() no código (R1)", () => {
  assert.doesNotMatch(preencher, /\.submit\s*\(/);
  assert.doesNotMatch(preencher, /\.click\s*\(/);
});

test("Não sobrescreve Campo já preenchido (R3)", () => {
  const doc = carregar(`<label for="n">Nome</label><input id="n" value="Ana S.">`);
  assert.strictEqual(doc.getElementById("n").value, "Ana S.");
});

test("Não altera Campo desabilitado nem somente leitura (R3)", () => {
  const doc = carregar(`
    <label for="d">Nome</label><input id="d" disabled>
    <label for="r">E-mail</label><input id="r" readonly>`);
  assert.strictEqual(doc.getElementById("d").value, "");
  assert.strictEqual(doc.getElementById("r").value, "");
});

test("Campo sem Sinônimo fica vazio sem quebrar os demais (R4)", () => {
  const doc = carregar(`
    <label for="p">Pretensão salarial</label><input id="p">
    <label for="e">E-mail</label><input id="e">`);
  assert.strictEqual(doc.getElementById("p").value, "");
  assert.strictEqual(doc.getElementById("e").value, "ana@exemplo.com");
});

test("Reconhece pela ordem label, name, id, placeholder (R2)", () => {
  const doc = carregar(`
    <input id="x" name="telefone">
    <input id="y" placeholder="Sua cidade">`);
  assert.strictEqual(doc.getElementById("x").value, "(11) 99999-0000");
  assert.strictEqual(doc.getElementById("y").value, "São Paulo");
});

test("Preenche o Portfólio reconhecido por label com acento ou por placeholder (R2)", () => {
  const doc = carregar(`
    <label for="p">Portfólio</label><input id="p">
    <input id="g" placeholder="Link do seu GitHub">
    <label for="s">Site pessoal</label><input id="s">
    <label for="l">LinkedIn</label><input id="l">`);
  assert.strictEqual(doc.getElementById("p").value, "github.com/anasouza-exemplo");
  assert.strictEqual(doc.getElementById("g").value, "github.com/anasouza-exemplo");
  assert.strictEqual(doc.getElementById("s").value, "github.com/anasouza-exemplo");
  assert.strictEqual(doc.getElementById("l").value, "linkedin.com/in/anasouza");
});

test("Escolhe a opção correspondente em select (R5)", () => {
  const doc = carregar(`
    <label for="c">Cidade</label>
    <select id="c"><option value="">Selecione</option><option value="rj">Rio</option><option value="sp">São Paulo</option></select>`);
  assert.strictEqual(doc.getElementById("c").value, "sp");
});

test("Select sem opção correspondente fica inalterado (R5)", () => {
  const doc = carregar(`
    <label for="c">Cidade</label>
    <select id="c"><option value="">Selecione</option><option value="rj">Rio</option></select>`);
  assert.strictEqual(doc.getElementById("c").value, "");
});
