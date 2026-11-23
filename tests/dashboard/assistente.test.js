// Testes da aba Assistente IA (S1 a S5): servidor real em porta livre e Agente falso. Sem chave, sem rede.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { criarServidor, HOST } = require("../../dashboard/server");

function config() {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), "dash-ia-"));
  return { autoSubmit: false, pastas: { saida, curriculos: path.join(saida, "cvs"), logs: path.join(saida, "logs") } };
}

/** Agente falso: guarda o que recebeu e emite eventos fixos. */
function agenteFalso() {
  const chamadas = [];
  return {
    chamadas,
    async executar(args) {
      chamadas.push({ ...args, onEvento: undefined });
      args.onEvento({ tipo: "ferramenta", estado: "inicio", nome: "consultar_base_pessoal", args: {} });
      args.onEvento({ tipo: "texto", texto: "<b>olá</b>" });
      args.onEvento({ tipo: "fim", ok: true, passos: 1, ferramentas: [] });
    }
  };
}

async function subir(assistente) {
  const servidor = criarServidor({ config: config(), assistente });
  await new Promise((resolve) => servidor.listen(0, HOST, resolve));
  const porta = /** @type {import("node:net").AddressInfo} */ (servidor.address()).port;
  const pedir = (corpo, headers = {}) => fetch(`http://${HOST}:${porta}/api/assistente`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(corpo) });
  return { servidor, porta, pedir, fechar: () => servidor.close() };
}

test("S1: devolve text/event-stream com os eventos do Agente, texto sem interpretar HTML", async () => {
  const agente = agenteFalso();
  const s = await subir(agente);
  try {
    const r = await s.pedir({ pergunta: "Analise a vaga", modo: "analise", perguntaDoFormulario: "Por que aqui?" });
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get("content-type") || "", /^text\/event-stream/);
    const corpo = await r.text();
    assert.deepStrictEqual([...corpo.matchAll(/^event: (.*)$/gm)].map((m) => m[1]), ["ferramenta", "texto", "fim"]);
    assert.match(corpo, /data: \{"tipo":"texto","texto":"<b>olá<\/b>"\}/); // o servidor manda o texto cru; a tela usa textContent (S5)
    assert.deepStrictEqual(agente.chamadas[0], { pergunta: "Analise a vaga", modo: "analise", perguntaDoFormulario: "Por que aqui?", onEvento: undefined });
  } finally { s.fechar(); }
});

test("S2: Host, Origin ou Content-Type inválidos dão 403 e o Agente não roda", async () => {
  const agente = agenteFalso();
  const s = await subir(agente);
  try {
    assert.strictEqual((await s.pedir({ pergunta: "oi" }, { Origin: "https://site-malicioso.example" })).status, 403);
    const semJson = await fetch(`http://${HOST}:${s.porta}/api/assistente`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}" });
    assert.strictEqual(semJson.status, 403);
    assert.strictEqual(agente.chamadas.length, 0);
  } finally { s.fechar(); }
});

test("S3: pergunta vazia, grande demais ou modo inválido dão 400 sem chamar o Agente", async () => {
  const agente = agenteFalso();
  const s = await subir(agente);
  try {
    assert.strictEqual((await s.pedir({ pergunta: "   " })).status, 400);
    assert.strictEqual((await s.pedir({})).status, 400);
    assert.strictEqual((await s.pedir({ pergunta: "x".repeat(2001) })).status, 400);
    assert.strictEqual((await s.pedir({ pergunta: "oi", modo: "enviar" })).status, 400);
    assert.strictEqual((await s.pedir({ pergunta: "oi", perguntaDoFormulario: "y".repeat(2001) })).status, 400);
    assert.strictEqual(agente.chamadas.length, 0);
  } finally { s.fechar(); }
});

test("S4: sem chave (sem Agente) responde 503 explicando o que fazer", async () => {
  const s = await subir(null);
  try {
    const r = await s.pedir({ pergunta: "oi" });
    assert.strictEqual(r.status, 503);
    assert.match((await r.json()).erro, /GEMINI_API_KEY/);
    const estado = await (await fetch(`http://${HOST}:${s.porta}/api/estado`)).json();
    assert.deepStrictEqual(estado.assistente, { disponivel: false });
  } finally { s.fechar(); }
});

test("S5: a tela existe, usa textContent e a resposta do estado não traz chave", async () => {
  const s = await subir(agenteFalso());
  try {
    const html = await (await fetch(`http://${HOST}:${s.porta}/`)).text();
    assert.match(html, /data-aba="assistente"[^>]*>Assistente IA/);
    const js = await (await fetch(`http://${HOST}:${s.porta}/app.js`)).text();
    const trecho = js.slice(js.indexOf("// ---- Assistente IA"));
    assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(trecho), "a aba não pode interpretar HTML");
    assert.ok(!/GEMINI_API_KEY\s*=|AIza/.test(js + html));
  } finally { s.fechar(); }
});
