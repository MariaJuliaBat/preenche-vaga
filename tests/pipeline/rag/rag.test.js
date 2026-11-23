// Testes do RAG (R1 a R9). Só dados fictícios, vetorizador local ou falso: nenhuma rede, nenhuma chave.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fragmentar } = require("../../../pipeline/rag/fragmentar");
const { indexar } = require("../../../pipeline/rag/indice");
const { buscar } = require("../../../pipeline/rag/buscar");
const { criarRag, pastasPadrao } = require("../../../pipeline/rag/index");
const { criarVetorizadorLocal, criarVetorizadorGemini, vetorizadorDoAmbiente, MODELO_LOCAL } = require("../../../pipeline/rag/vetorizar");

const RAIZ = path.join(__dirname, "..", "..", "..");
const EXEMPLO = { rotulo: "exemplo", caminho: path.join(RAIZ, "docs", "base-conhecimento-exemplo") };
const pastaTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), "rag-"));

/** Vetorizador local que conta quantos textos recebeu. */
function contador() {
  const base = criarVetorizadorLocal();
  const c = { textos: 0, chamadas: 0, modelo: base.modelo, vetorizar: async (/** @type {string[]} */ t, /** @type {any} */ tipo) => { c.chamadas++; c.textos += t.length; return base.vetorizar(t, tipo); } };
  return c;
}

test("R1/R2: fragmenta por seção, respeita o tamanho máximo e guarda fonte e seção", () => {
  const md = `# Doc\n\n## Projeto A\n\n${"alfa beta gama. ".repeat(30)}\n\n## Projeto B\n\nTexto curto do B.`;
  const trechos = fragmentar(md, { fonte: "x.md", tamanhoMax: 200, sobreposicao: 40 });
  assert.ok(trechos.length >= 3);
  for (const t of trechos) { assert.ok(t.texto.length <= 200, `passou de 200: ${t.texto.length}`); assert.strictEqual(t.fonte, "x.md"); }
  assert.deepStrictEqual([...new Set(trechos.map((t) => t.secao))], ["Projeto A", "Projeto B"]);
  assert.strictEqual(trechos.at(-1).texto, "Texto curto do B.");
});

test("R1: sobreposição repete o fim do trecho anterior no começo do próximo", () => {
  const paragrafos = ["um dois três quatro cinco seis sete oito nove dez", "onze doze treze quatorze quinze dezesseis dezessete dezoito"].join("\n\n");
  const [a, b] = fragmentar(paragrafos, { tamanhoMax: 80, sobreposicao: 20 });
  const fimDeA = a.texto.split(" ").slice(-2).join(" ");
  assert.ok(b.texto.includes(fimDeA), `"${b.texto}" deveria começar com o fim de "${a.texto}"`);
  assert.ok(b.texto.length <= 80);
});

test("R1: parâmetros inválidos são recusados e texto vazio não gera trechos", () => {
  assert.throws(() => fragmentar("x", { tamanhoMax: 10 }), /tamanhoMax/);
  assert.throws(() => fragmentar("x", { tamanhoMax: 100, sobreposicao: 90 }), /sobreposicao/);
  assert.deepStrictEqual(fragmentar("   \n\n  "), []);
});

test("R4/R5: segunda indexação reaproveita o cache; arquivo novo, alterado ou removido é tratado", async () => {
  const pasta = pastaTemp();
  const base = path.join(pasta, "base");
  fs.mkdirSync(base);
  fs.writeFileSync(path.join(base, "a.md"), "# A\n\nProjeto com Playwright e Node.");
  fs.writeFileSync(path.join(base, "b.txt"), "Estudo de React e TypeScript.");
  fs.writeFileSync(path.join(base, "ignorado.pdf"), "nada");
  const v = contador();
  const args = { pastas: [{ rotulo: "t", caminho: base }], caminhoIndice: path.join(pasta, "out", "rag-index.json"), vetorizador: v };

  const primeira = await indexar(args);
  assert.deepStrictEqual(primeira.vetorizados, ["t/a.md", "t/b.txt"]);
  assert.strictEqual(v.chamadas, 2);

  const segunda = await indexar(args);
  assert.deepStrictEqual(segunda.reaproveitados, ["t/a.md", "t/b.txt"]);
  assert.strictEqual(v.chamadas, 2, "não deveria chamar a API de novo");

  fs.writeFileSync(path.join(base, "a.md"), "# A\n\nProjeto novo com Docker.");
  fs.rmSync(path.join(base, "b.txt"));
  const terceira = await indexar(args);
  assert.deepStrictEqual(terceira.vetorizados, ["t/a.md"]);
  assert.deepStrictEqual(terceira.removidos, ["t/b.txt"]);
  assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(args.caminhoIndice, "utf8")).arquivos), ["t/a.md"]);
});

test("R6: índice de outro modelo não é misturado", async () => {
  const pasta = pastaTemp();
  const base = path.join(pasta, "base");
  fs.mkdirSync(base);
  fs.writeFileSync(path.join(base, "a.md"), "Projeto com Node.");
  const caminhoIndice = path.join(pasta, "rag-index.json");
  await indexar({ pastas: [{ rotulo: "t", caminho: base }], caminhoIndice, vetorizador: criarVetorizadorLocal() });
  const outro = { modelo: "outro-modelo", vetorizar: async (/** @type {string[]} */ t) => t.map(() => [1, 0]) };
  const r = await indexar({ pastas: [{ rotulo: "t", caminho: base }], caminhoIndice, vetorizador: outro });
  assert.deepStrictEqual(r.vetorizados, ["t/a.md"]);
  assert.strictEqual(r.indice.modelo, "outro-modelo");
});

test("R6: sem GEMINI_API_KEY usa o local; com chave usa o Gemini", () => {
  assert.strictEqual(vetorizadorDoAmbiente({}).modelo, MODELO_LOCAL);
  assert.strictEqual(vetorizadorDoAmbiente({ GEMINI_API_KEY: "chave-falsa" }).modelo, "gemini-embedding-001");
});

test("R3: o vetorizador Gemini envia lote, chave no cabeçalho e tipo de tarefa; erro não vaza a chave", async () => {
  /** @type {any[]} */
  const chamadas = [];
  const fetchImpl = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ init) => {
    chamadas.push({ url, init, corpo: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ embeddings: chamadas.at(-1).corpo.requests.map(() => ({ values: [3, 4] })) }) };
  });
  const v = criarVetorizadorGemini({ apiKey: "SEGREDO-123", fetchImpl });
  const [vetor] = await v.vetorizar(["oi"], "consulta");
  assert.deepStrictEqual(vetor, [0.6, 0.8]);
  assert.ok(chamadas[0].url.endsWith("gemini-embedding-001:batchEmbedContents"));
  assert.ok(!chamadas[0].url.includes("SEGREDO"), "a chave não pode ir na URL");
  assert.strictEqual(chamadas[0].init.headers["x-goog-api-key"], "SEGREDO-123");
  assert.strictEqual(chamadas[0].corpo.requests[0].taskType, "RETRIEVAL_QUERY");

  const falha = criarVetorizadorGemini({ apiKey: "SEGREDO-123", fetchImpl: /** @type {any} */ (async () => ({ ok: false, status: 403 })) });
  await assert.rejects(() => falha.vetorizar(["x"]), (e) => /403/.test(e.message) && !e.message.includes("SEGREDO"));
});

test("R7: busca por cosseno devolve topK ordenado, com score e fonte", async () => {
  const rag = criarRag({ raiz: RAIZ, pastaSaida: pastaTemp(), vetorizador: criarVetorizadorLocal(), pastas: [EXEMPLO] });
  const r = await rag.buscar("projeto com Playwright planilha Google Sheets", { topK: 2 });
  assert.strictEqual(r.length, 2);
  assert.ok(r[0].score >= r[1].score);
  assert.match(r[0].fonte, /^exemplo\/projetos\.md$/);
  assert.match(r[0].texto, /Playwright/);
  assert.strictEqual(r[0].secao, "Projeto Robô de Conferência");
});

test("R8: consulta vazia ou índice vazio devolvem lista vazia sem chamar a API", async () => {
  const v = contador();
  assert.deepStrictEqual(await buscar({ versao: 1, modelo: "x", arquivos: {} }, "algo", v), []);
  const rag = criarRag({ raiz: RAIZ, pastaSaida: pastaTemp(), vetorizador: v, pastas: [EXEMPLO] });
  await rag.indexar();
  const antes = v.chamadas;
  assert.deepStrictEqual(await rag.buscar("   "), []);
  assert.strictEqual(v.chamadas, antes);
});

test("R9: a base pessoal só entra quando secrets/base-conhecimento existir", () => {
  const raiz = pastaTemp();
  fs.mkdirSync(path.join(raiz, "docs", "base-conhecimento-exemplo"), { recursive: true });
  assert.deepStrictEqual(pastasPadrao(raiz).map((p) => p.rotulo), ["exemplo"]);
  fs.mkdirSync(path.join(raiz, "secrets", "base-conhecimento"), { recursive: true });
  assert.deepStrictEqual(pastasPadrao(raiz).map((p) => p.rotulo), ["exemplo", "pessoal"]);
});

test("a base de exemplo do repositório existe e é indexável", async () => {
  const rag = criarRag({ raiz: RAIZ, pastaSaida: pastaTemp(), vetorizador: criarVetorizadorLocal() });
  const { indice } = await rag.indexar();
  assert.ok(Object.keys(indice.arquivos).some((f) => f.startsWith("exemplo/")));
});
