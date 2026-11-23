// Testes da Pontuação (RD14 a RD16) e do Lote Final com a Cota DF (RD17 a RD20).
const test = require("node:test");
const assert = require("node:assert");
const { pontuar } = require("../../../pipeline/radar/pontuar");
const { montarLote } = require("../../../pipeline/radar/lote");
const { PESOS } = require("../../../pipeline/radar/pesos");

const vaga = (descricao, titulo = "Dev Júnior") => ({ titulo, url: "https://vagas.exemplo/p/1", descricao, rotulos: [], fonte: "Teste" });
const PERFIL = { habilidades: ["React", "Node.js", "Python"] };

test("pesos aprovados: IA 5, stack 2, nível 1, área de desenvolvimento 3, Vaga DF +2", () => {
  assert.deepStrictEqual({ ...PESOS }, { iaAplicada: 5, termoDaStack: 2, nivelExplicito: 1, areaDesenvolvimento: 3, vagaDF: 2 });
});

test("IA aplicada pontua mais que um termo da stack", () => {
  const stack = pontuar(vaga("Usamos React."), {}, PERFIL);
  const ia = pontuar(vaga("Usamos Claude Code no dia a dia."), {}, PERFIL);
  assert.strictEqual(stack.pontos, 2);
  assert.strictEqual(ia.pontos, 5);
  assert.ok(ia.pontos > stack.pontos);
});

test("cada termo da stack e cada grupo de IA contam uma vez, mesmo repetidos ou com sinônimos", () => {
  const p = pontuar(vaga("React, react e REACT. GitHub Copilot e Copilot. Prompt engineering. Node.js."), {}, PERFIL);
  assert.deepStrictEqual(p.stack.sort(), ["node.js", "react"]);
  assert.deepStrictEqual(p.ia.sort(), ["copilot", "prompt engineering"]);
  assert.strictEqual(p.pontos, 2 * 5 + 2 * 2);
});

test("nível explícito soma 1 e Vaga DF soma 2", () => {
  const p = pontuar(vaga("Sem termos."), { nivel: { tipo: "permitido" }, local: { ehVagaDF: true } }, PERFIL);
  assert.strictEqual(p.pontos, 1 + 2);
});

test("sem Perfil, só IA aplicada pontua; pontuação zero não é erro (RD14)", () => {
  assert.strictEqual(pontuar(vaga("Usamos React."), {}).pontos, 0);
  assert.strictEqual(pontuar(vaga("Spec-Driven Development (SDD) e Cursor."), {}).pontos, 10);
});

test("termo não casa dentro de outra palavra", () => {
  assert.strictEqual(pontuar(vaga("Trabalhamos com reactivos e pythonico."), {}, PERFIL).pontos, 0);
});

const aprov = (nome, pontos, ehVagaDF) => ({ nome, pontos, ehVagaDF });

test("RD20: lote de 10 com pelo menos 5 Vagas DF, mesmo que as remotas pontuem mais", () => {
  const todas = [
    ...Array.from({ length: 7 }, (_, i) => aprov(`remota-${i}`, 20 - i, false)),
    ...Array.from({ length: 7 }, (_, i) => aprov(`df-${i}`, 3 - 0.1 * i, true))
  ];
  const r = montarLote(todas, 10);
  assert.strictEqual(r.lote.length, 10);
  assert.ok(r.emDF >= 5);
  assert.strictEqual(r.cotaNecessaria, 5);
  assert.strictEqual(r.cotaAtingida, true);
  assert.strictEqual(r.percentualDF, 50);
  // ordenado por pontuação
  assert.deepStrictEqual(r.lote.map((v) => v.pontos), [...r.lote.map((v) => v.pontos)].sort((a, b) => b - a));
});

test("a cota usa o tamanho real do lote quando há menos que o máximo", () => {
  const r = montarLote([aprov("a", 5, false), aprov("b", 4, true), aprov("c", 3, false), aprov("d", 2, false)], 10);
  assert.strictEqual(r.lote.length, 4);
  assert.strictEqual(r.cotaNecessaria, 2);
  assert.strictEqual(r.cotaAtingida, false);
  assert.strictEqual(r.percentualDF, 25);
});

test("o lote respeita o máximo configurado e não inclui o que passa dele", () => {
  const r = montarLote(Array.from({ length: 30 }, (_, i) => aprov(`v${i}`, i, i % 2 === 0)), 4);
  assert.strictEqual(r.lote.length, 4);
  assert.ok(r.emDF >= 2);
});

test("sem nenhuma vaga, o lote é vazio e a cota não é cobrada", () => {
  const r = montarLote([], 10);
  assert.deepStrictEqual([r.lote.length, r.cotaAtingida, r.percentualDF], [0, true, 0]);
});
