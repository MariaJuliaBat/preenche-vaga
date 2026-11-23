// Testes do Structured Output e da Ancoragem (A6, A7, A9). Sem rede.
const test = require("node:test");
const assert = require("node:assert");
const { AnaliseSchema, RESPONSE_SCHEMA, ancorarAnalise, pedirAnalise } = require("../../../pipeline/agente/analise");

const valida = {
  score: 70,
  resumo: "Boa aderência em Node.js.",
  pontosFortes: [{ ponto: "Automação", evidencia: "Automação com Playwright" }, { ponto: "Kubernetes", evidencia: "Cluster Kubernetes em produção" }],
  lacunas: ["Docker"],
  rascunhoResposta: { pergunta: "Por que quer trabalhar aqui?", resposta: "Porque quero aprender com um time que testa." }
};

test("A6: o schema Zod aceita a análise e recusa score fora de 0 a 100 ou campo faltando", () => {
  assert.ok(AnaliseSchema.safeParse(valida).success);
  assert.ok(!AnaliseSchema.safeParse({ ...valida, score: 101 }).success);
  assert.ok(!AnaliseSchema.safeParse({ ...valida, lacunas: undefined }).success);
  assert.ok(AnaliseSchema.safeParse({ ...valida, rascunhoResposta: null }).success);
});

test("A6: o responseSchema do Gemini declara os mesmos campos do Zod", () => {
  assert.deepStrictEqual(Object.keys(RESPONSE_SCHEMA.properties).sort(), Object.keys(AnaliseSchema.shape).sort());
  assert.deepStrictEqual([...RESPONSE_SCHEMA.required].sort(), Object.keys(AnaliseSchema.shape).sort());
});

test("A9: ponto forte sem evidência nas fontes é removido, e o aviso diz qual", () => {
  const { analise, avisos } = ancorarAnalise(valida, ["Projeto: automação  com PLAYWRIGHT que confere notas"]);
  assert.deepStrictEqual(analise.pontosFortes.map((p) => p.ponto), ["Automação"]);
  assert.strictEqual(avisos.length, 1);
  assert.match(avisos[0], /Kubernetes/);
});

test("A9: evidência vazia ou curtíssima nunca ancora", () => {
  const { analise } = ancorarAnalise({ ...valida, pontosFortes: [{ ponto: "x", evidencia: " a " }] }, ["a b c"]);
  assert.strictEqual(analise.pontosFortes.length, 0);
});

test("A6: pedirAnalise usa responseSchema e devolve o objeto validado", async () => {
  const pedidos = [];
  const cliente = { gerar: async (p) => { pedidos.push(p); return JSON.stringify(valida); } };
  assert.deepStrictEqual(await pedirAnalise(cliente, { systemInstruction: "s", contents: [] }), valida);
  assert.strictEqual(pedidos[0].responseSchema, RESPONSE_SCHEMA);
});

test("A7: JSON inválido tenta mais uma vez; segunda falha dá erro claro, nunca objeto parcial", async () => {
  const respostas = ["isto não é json", JSON.stringify(valida)];
  const ok = await pedirAnalise({ gerar: async () => respostas.shift() }, { systemInstruction: "s", contents: [] });
  assert.strictEqual(ok.score, 70);

  let chamadas = 0;
  const ruim = { gerar: async () => { chamadas++; return JSON.stringify({ score: 1 }); } };
  await assert.rejects(() => pedirAnalise(ruim, { systemInstruction: "s", contents: [] }), /análise válida/);
  assert.strictEqual(chamadas, 2);
});
