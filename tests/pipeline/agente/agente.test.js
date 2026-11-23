// Testes do Agente (A1 a A8, A11, A13) e do cliente Gemini. Cliente falso: sem rede, sem chave.
const test = require("node:test");
const assert = require("node:assert");
const { criarAgente } = require("../../../pipeline/agente/agente");
const { criarFerramentas } = require("../../../pipeline/agente/ferramentas");
const { criarClienteGemini, lerSse } = require("../../../pipeline/agente/gemini");
const { SYSTEM_PROMPT } = require("../../../pipeline/agente/prompt");
const { PERFIL_FALSO, VAGAS_FALSAS, ragFalso, chunk, clienteFalso } = require("./auxiliar");

const ferramentas = () => criarFerramentas({ rag: ragFalso(), lerVagas: () => VAGAS_FALSAS, lerPerfil: () => PERFIL_FALSO });
const coletar = () => { const eventos = []; return { eventos, onEvento: (e) => eventos.push(e) }; };

test("A1/A2/A3/A8: tool calling com streaming, na ordem ferramenta, texto e fim", async () => {
  const cliente = clienteFalso({
    roteiro: [
      [chunk({ functionCall: { name: "consultar_base_pessoal", args: { consulta: "automação" } } })],
      [chunk({ text: "Você fez " }), chunk({ text: "automação com Playwright." })]
    ]
  });
  const { eventos, onEvento } = coletar();
  const r = await criarAgente({ cliente, ferramentas: ferramentas() }).executar({ pergunta: "O que já fiz com automação?", onEvento });

  assert.deepStrictEqual(eventos.map((e) => e.tipo + (e.estado ? `:${e.estado}` : "")), ["ferramenta:inicio", "ferramenta:fim", "texto", "texto", "fim"]);
  assert.strictEqual(eventos.at(-1).ok, true);
  assert.deepStrictEqual(eventos.at(-1).ferramentas, ["consultar_base_pessoal"]);
  assert.strictEqual(r.passos, 2);

  // A1: System Prompt dedicado e as 3 ferramentas declaradas em todo pedido
  const p1 = cliente.pedidos.transmitir[0];
  assert.strictEqual(p1.systemInstruction, SYSTEM_PROMPT);
  assert.match(SYSTEM_PROMPT, /Nunca invente/);
  assert.strictEqual(p1.tools.length, 3);
  // A3: o resultado da ferramenta volta ao modelo como functionResponse, depois do functionCall dele
  const p2 = cliente.pedidos.transmitir[1].contents;
  assert.ok(p2[1].parts[0].functionCall);
  assert.strictEqual(p2[2].parts[0].functionResponse.name, "consultar_base_pessoal");
  assert.match(JSON.stringify(p2[2].parts[0].functionResponse.response), /Playwright/);
});

test("A4: o modelo pede ferramenta inexistente: o erro volta ao modelo e nada quebra", async () => {
  const cliente = clienteFalso({ roteiro: [[chunk({ functionCall: { name: "enviar_candidatura", args: {} } })], [chunk({ text: "Não posso enviar." })]] });
  const { eventos, onEvento } = coletar();
  const r = await criarAgente({ cliente, ferramentas: ferramentas() }).executar({ pergunta: "envie", onEvento });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(eventos.find((e) => e.estado === "fim").ok, false);
  assert.match(JSON.stringify(cliente.pedidos.transmitir[1].contents), /Ferramenta desconhecida: enviar_candidatura/);
});

test("A5: passa do limite de passos chamando ferramenta: para e avisa", async () => {
  const sempre = [chunk({ functionCall: { name: "consultar_vagas_planilha", args: {} } })];
  const cliente = clienteFalso({ roteiro: [sempre, sempre, sempre] });
  const { eventos, onEvento } = coletar();
  const r = await criarAgente({ cliente, ferramentas: ferramentas(), maxPassos: 2 }).executar({ pergunta: "vagas?", onEvento });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(cliente.pedidos.transmitir.length, 2);
  assert.ok(eventos.some((e) => e.tipo === "erro" && /Limite de 2 passos/.test(e.mensagem)));
  assert.strictEqual(eventos.at(-1).tipo, "fim");
});

test("A6/A8/A9: modo analise devolve o JSON validado e ancorado, depois do texto", async () => {
  const analise = {
    score: 80, resumo: "Boa.",
    pontosFortes: [{ ponto: "Automação", evidencia: "Automação em Node.js com Playwright" }, { ponto: "Inventado", evidencia: "Liderei 40 pessoas" }],
    lacunas: ["Docker"], rascunhoResposta: { pergunta: "Por que aqui?", resposta: "Quero aprender." }
  };
  const cliente = clienteFalso({
    roteiro: [[chunk({ functionCall: { name: "consultar_base_pessoal", args: { consulta: "automação" } } })], [chunk({ text: "Segue a análise." })]],
    analises: [JSON.stringify(analise)]
  });
  const { eventos, onEvento } = coletar();
  await criarAgente({ cliente, ferramentas: ferramentas() }).executar({ pergunta: "Analise a vaga", modo: "analise", perguntaDoFormulario: "Por que quer trabalhar aqui?", onEvento });

  assert.deepStrictEqual(eventos.map((e) => e.tipo), ["ferramenta", "ferramenta", "texto", "analise", "fim"]);
  const ev = eventos.find((e) => e.tipo === "analise");
  assert.deepStrictEqual(ev.dados.pontosFortes.map((p) => p.ponto), ["Automação"]);
  assert.match(ev.avisos[0], /Inventado/);
  assert.ok(cliente.pedidos.gerar[0].responseSchema, "Structured Output pede responseSchema");
  // A11: a pergunta do formulário foi entregue dentro de um bloco de dado
  assert.match(cliente.pedidos.transmitir[0].contents[0].parts[0].text, /<<<DADO_NAO_CONFIAVEL \(pergunta de formulário\)/);
});

test("A7/A8: análise inválida vira evento erro (nunca análise parcial) e o fim vem com ok falso", async () => {
  const cliente = clienteFalso({ roteiro: [[chunk({ text: "ok" })]], analises: ["{}", "{}"] });
  const { eventos, onEvento } = coletar();
  const r = await criarAgente({ cliente, ferramentas: ferramentas() }).executar({ pergunta: "analise", modo: "analise", onEvento });
  assert.strictEqual(r.ok, false);
  assert.ok(!eventos.some((e) => e.tipo === "analise"));
  assert.ok(eventos.some((e) => e.tipo === "erro" && /análise válida/.test(e.mensagem)));
});

test("A8: falha do cliente vira evento erro, sem lançar", async () => {
  const cliente = { transmitir: () => ({ [Symbol.asyncIterator]: () => ({ next: async () => { throw new Error("rede caiu"); } }) }), gerar: async () => "" };
  const { eventos, onEvento } = coletar();
  const r = await criarAgente({ cliente, ferramentas: ferramentas() }).executar({ pergunta: "oi", onEvento });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(eventos.map((e) => e.tipo), ["erro", "fim"]);
});

test("A12: o Agente não tem como enviar: as únicas ferramentas declaradas são de leitura", async () => {
  const cliente = clienteFalso({ roteiro: [[chunk({ text: "oi" })]] });
  await criarAgente({ cliente, ferramentas: ferramentas() }).executar({ pergunta: "oi" });
  assert.deepStrictEqual(cliente.pedidos.transmitir[0].tools.map((t) => t.name), ["consultar_base_pessoal", "consultar_vagas_planilha", "analisar_vaga_e_curriculo"]);
});

test("A13: sem chave o cliente Gemini recusa nascer, com mensagem clara", () => {
  assert.throws(() => criarClienteGemini({ apiKey: "" }), /GEMINI_API_KEY/);
});

test("Gemini: lerSse junta pedaços quebrados no meio e ignora [DONE]", async () => {
  async function* corpo() {
    yield 'data: {"a":';
    yield '1}\n\ndata: {"b":2}\r\n\r\n';
    yield new TextEncoder().encode("data: [DONE]\n\n");
  }
  const lidos = [];
  for await (const e of lerSse(corpo())) lidos.push(e);
  assert.deepStrictEqual(lidos, [{ a: 1 }, { b: 2 }]);
});

test("Gemini: o pedido leva a chave no cabeçalho, systemInstruction, tools e responseSchema; erro não vaza a chave", async () => {
  const chamadas = [];
  const fetchImpl = async (url, init) => {
    chamadas.push({ url, init, corpo: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"x":1}' }] } }] }) };
  };
  const c = criarClienteGemini({ apiKey: "SEGREDO-XYZ", modelo: "modelo-teste", fetchImpl });
  const texto = await c.gerar({ systemInstruction: "sys", contents: [], tools: [{ name: "t" }], responseSchema: { type: "OBJECT" } });
  assert.strictEqual(texto, '{"x":1}');
  assert.ok(chamadas[0].url.endsWith("models/modelo-teste:generateContent"));
  assert.ok(!chamadas[0].url.includes("SEGREDO"));
  assert.strictEqual(chamadas[0].init.headers["x-goog-api-key"], "SEGREDO-XYZ");
  const { corpo } = chamadas[0];
  assert.strictEqual(corpo.systemInstruction.parts[0].text, "sys");
  assert.strictEqual(corpo.tools[0].functionDeclarations[0].name, "t");
  assert.strictEqual(corpo.generationConfig.responseMimeType, "application/json");

  const ruim = criarClienteGemini({ apiKey: "SEGREDO-XYZ", fetchImpl: async () => ({ ok: false, status: 429 }) });
  await assert.rejects(() => ruim.gerar({ systemInstruction: "s", contents: [] }), (e) => /429/.test(e.message) && !e.message.includes("SEGREDO"));
});
