const test = require("node:test");
const assert = require("node:assert/strict");
const { criarClienteGemini } = require("../../../pipeline/agente/gemini");
const { criarVetorizadorGemini } = require("../../../pipeline/rag/vetorizar");

const CHAVE = "chave-ficticia-123";
const falha = (status, message) => async () => ({ ok: false, status, json: async () => ({ error: { message } }) });
const pedido = { systemInstruction: "x", contents: [] };

test("erro do Gemini inclui error.message e nunca a chave", async () => {
  const c = criarClienteGemini({ apiKey: CHAVE, fetchImpl: /** @type {any} */ (falha(404, `modelo sumiu (${CHAVE})`)) });
  await assert.rejects(c.gerar(pedido), (e) => {
    assert.match(e.message, /HTTP 404.*modelo sumiu/);
    assert.ok(!e.message.includes(CHAVE));
    return true;
  });
});

test("erro sem corpo JSON mantém só o código HTTP", async () => {
  const f = async () => ({ ok: false, status: 500, json: async () => { throw new Error("x"); } });
  const c = criarClienteGemini({ apiKey: CHAVE, fetchImpl: /** @type {any} */ (f) });
  await assert.rejects(c.gerar(pedido), /HTTP 500\)\.$/);
});

test("erro de embeddings inclui error.message e a URL não duplica models/", async () => {
  let url = "";
  const f = async (/** @type {string} */ u) => { url = u; return falha(403, "sem permissão")(); };
  const v = criarVetorizadorGemini({ apiKey: CHAVE, modelo: "gemini-embedding-001", fetchImpl: /** @type {any} */ (f) });
  await assert.rejects(v.vetorizar(["a"]), /HTTP 403.*sem permissão/);
  assert.ok(!url.includes("models/models"));
});
