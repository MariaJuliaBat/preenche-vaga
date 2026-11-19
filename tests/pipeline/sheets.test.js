// Testes do módulo Sheets com cliente e fetch falsos: nunca usam rede nem planilha real. Só dados fictícios.
const test = require("node:test");
const assert = require("node:assert");
const { normalizarUrl, criarClienteSheets, lerVagas, montarLinha, registrarVagas } = require("../../pipeline/sheets");

const CABECALHO = ["Nº", "Vaga", "Link da vaga", "Empresa"];

/** Cliente falso em memória: linha 4 é o cabeçalho, as vagas começam na 5. */
function clienteFalso(vagas = [], cabecalho = CABECALHO) {
  const escritas = [];
  return {
    escritas,
    async obterValores(_id, faixa) {
      if (/!A4:L4$/.test(faixa)) return [cabecalho];
      return vagas;
    },
    async escreverValores(id, faixa, valores) { escritas.push({ id, faixa, valores }); }
  };
}

const VAGA = {
  titulo: "Dev Júnior Fictícia", url: "https://gupy.exemplo/vaga/1", empresa: "Acme Exemplo",
  site: "Gupy", situacao: "enviada"
};

test("normalizarUrl ignora utm, fragmento, barra final e maiúsculas no host", () => {
  assert.strictEqual(
    normalizarUrl("HTTPS://Gupy.Exemplo/vaga/1/?utm_source=x&b=2&a=1#topo"),
    normalizarUrl("https://gupy.exemplo/vaga/1?a=1&b=2")
  );
  assert.strictEqual(normalizarUrl(""), "");
});

test("lerVagas acha URLs, último número e primeira linha vazia", async () => {
  const cliente = clienteFalso([
    ["1", "A", "https://x.exemplo/1/"],
    ["2", "B", "https://x.exemplo/2"],
    ["7", "C", "https://x.exemplo/3"],
    [], // linha vazia no meio: é a primeira vazia
    ["8", "D", "https://x.exemplo/4"]
  ]);
  const lido = await lerVagas(cliente, "ID");
  assert.strictEqual(lido.ultimoNumero, 8);
  assert.strictEqual(lido.proximaLinha, 5 + 3); // a linha vazia no meio
  assert.ok(lido.urlsExistentes.has("https://x.exemplo/1"));
  assert.strictEqual(lido.urlsExistentes.size, 4);
});

test("lerVagas: sem linha vazia, escreve depois da última; planilha sem vagas começa na linha 5", async () => {
  assert.strictEqual((await lerVagas(clienteFalso([["1", "A", "https://x.exemplo/1"]]), "ID")).proximaLinha, 6);
  const vazio = await lerVagas(clienteFalso([]), "ID");
  assert.strictEqual(vazio.proximaLinha, 5);
  assert.strictEqual(vazio.ultimoNumero, 0);
});

test("linha livre = primeira com Link vazio, mesmo com coluna A pré-numerada", async () => {
  const cliente = clienteFalso([
    ["1", "A", "https://x.exemplo/1"],
    ["2", "", ""],
    ["3", "", ""],
    ["4", "B", "https://x.exemplo/4"]
  ]);
  const lido = await lerVagas(cliente, "ID");
  assert.strictEqual(lido.proximaLinha, 6);
  assert.deepStrictEqual(lido.livres.map((l) => l.numero), [2, 3]);
});

test("registrarVagas usa o número pré-numerado, grava só B:L nele e continua depois do fim", async () => {
  const cliente = clienteFalso([["1", "A", "https://x.exemplo/1"], ["2", "", ""], ["3", "", ""]]);
  const vagas = [1, 2, 3].map((n) => ({ ...VAGA, url: `https://gupy.exemplo/vaga/${n}` }));
  await registrarVagas(cliente, { planilhaId: "ID", escreverPlanilha: true }, vagas);

  assert.deepStrictEqual(cliente.escritas.map((e) => e.faixa), ["'Vagas'!B6:L6", "'Vagas'!B7:L7", "'Vagas'!A8:L8"]);
  assert.strictEqual(cliente.escritas[0].valores[0].length, 11);
  assert.strictEqual(cliente.escritas[0].valores[0][1], "https://gupy.exemplo/vaga/1");
  assert.strictEqual(cliente.escritas[2].valores[0][0], 4);
});

test("recusa planilha cuja linha 4 não é o cabeçalho esperado", async () => {
  const cliente = clienteFalso([], ["Outra", "coisa", "qualquer"]);
  await assert.rejects(lerVagas(cliente, "ID"), /Link da vaga/);
  await assert.rejects(registrarVagas(cliente, { planilhaId: "ID", escreverPlanilha: true }, [VAGA]), /Link da vaga/);
  assert.strictEqual(cliente.escritas.length, 0);
});

test("montarLinha segue o mapeamento A a L (enviada)", () => {
  assert.deepStrictEqual(montarLinha({ ...VAGA, observacoes: "IA aplicada" }, 9), [
    9, "Dev Júnior Fictícia", "https://gupy.exemplo/vaga/1", "Acme Exemplo", "Busca automática - Gupy",
    "", "", "Sim", "Candidatura enviada", "Assim que possível", "Candidatura enviada - CV adaptado", "IA aplicada"
  ]);
});

test("montarLinha de pendência usa 'Se candidatar', o prazo e o motivo", () => {
  const linha = montarLinha({
    ...VAGA, situacao: "pendente", prazo: "30/11/2026", motivoPendencia: "Aguardando login/CAPTCHA - CV gerado"
  }, 2);
  assert.strictEqual(linha[8], "Se candidatar");
  assert.strictEqual(linha[9], "30/11/2026");
  assert.strictEqual(linha[10], "Aguardando login/CAPTCHA - CV gerado");
  assert.strictEqual(linha.length, 12);
});

test("registrarVagas numera, escreve na primeira linha vazia e descarta duplicadas", async () => {
  const cliente = clienteFalso([["3", "A", "https://gupy.exemplo/vaga/1/"], ["4", "B", "https://x.exemplo/2"]]);
  const outra = { ...VAGA, titulo: "Estágio Fictício", url: "https://gupy.exemplo/vaga/2" };
  const r = await registrarVagas(cliente, { planilhaId: "ID", escreverPlanilha: true }, [VAGA, outra, outra]);

  assert.strictEqual(r.escritas, 1);
  assert.strictEqual(r.duplicadas.length, 2); // a já existente e a repetida no lote
  assert.strictEqual(r.gravado, true);
  assert.strictEqual(cliente.escritas.length, 1);
  assert.strictEqual(cliente.escritas[0].faixa, "'Vagas'!A7:L7");
  assert.strictEqual(cliente.escritas[0].valores[0][0], 5); // sem pré-numeração: maior + 1
  assert.strictEqual(cliente.escritas[0].valores[0][2], "https://gupy.exemplo/vaga/2");
});

test("dry-run não escreve na planilha, mas devolve o que escreveria", async () => {
  const cliente = clienteFalso([]);
  const r = await registrarVagas(cliente, { planilhaId: "ID", escreverPlanilha: false }, [VAGA]);
  assert.strictEqual(r.gravado, false);
  assert.strictEqual(r.escritas, 1);
  assert.strictEqual(cliente.escritas.length, 0);
});

test("sem vagas novas não chama a API de escrita", async () => {
  const cliente = clienteFalso([["1", "A", VAGA.url]]);
  const r = await registrarVagas(cliente, { planilhaId: "ID", escreverPlanilha: true }, [VAGA]);
  assert.strictEqual(r.escritas, 0);
  assert.strictEqual(cliente.escritas.length, 0);
});

test("vaga sem URL é tratada como duplicada (nunca vira linha sem link)", async () => {
  const cliente = clienteFalso([]);
  const r = await registrarVagas(cliente, { planilhaId: "ID", escreverPlanilha: true }, [{ ...VAGA, url: "" }]);
  assert.strictEqual(r.escritas, 0);
});

test("cliente REST: GET com token, PUT com RAW e erro 403 com dica", async () => {
  const chamadas = [];
  const respostas = [
    { ok: true, status: 200, json: async () => ({ values: [["x"]] }) },
    { ok: true, status: 200, json: async () => ({}) },
    { ok: false, status: 403, json: async () => ({}) }
  ];
  const cliente = criarClienteSheets({
    obterToken: async () => "TOKEN-FALSO",
    fetchImpl: async (url, init) => { chamadas.push({ url, init }); return respostas.shift(); }
  });

  assert.deepStrictEqual(await cliente.obterValores("ABC", "'Vagas'!A5:L"), [["x"]]);
  assert.ok(chamadas[0].url.includes("/ABC/values/"));
  assert.ok(chamadas[0].url.includes(encodeURIComponent("'Vagas'!A5:L")));
  assert.strictEqual(chamadas[0].init.headers.Authorization, "Bearer TOKEN-FALSO");

  await cliente.escreverValores("ABC", "'Vagas'!A5:L5", [["=1+1"]]);
  assert.match(chamadas[1].url, /valueInputOption=RAW/);
  assert.strictEqual(chamadas[1].init.method, "PUT");
  assert.deepStrictEqual(JSON.parse(chamadas[1].init.body).values, [["=1+1"]]);

  await assert.rejects(cliente.obterValores("ABC", "A1"), /403.*Service Account/);
});
