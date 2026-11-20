// Etapa 4 do Auto-Apply: planilha (colunas I, K, L), Pendências, Recibo e modos (A24 a A29). Navegador e planilha FALSOS.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { criarEtapaCandidatura } = require("../../../pipeline/apply/etapa");
const { montarObservacoes, atualizarCandidatura, lerPendentesDeCurriculo, lerVagasParaCandidatar } = require("../../../pipeline/sheets");
const { registrarCv, cvDaVaga } = require("../../../pipeline/curriculo/manifesto");
const { montarConfig } = require("../../../pipeline/config");
const { resultadoVazio, formatarResumo } = require("../../../pipeline/resumo");
const logs = require("../../../pipeline/logs");

const SHEET = "https://docs.google.com/spreadsheets/d/PLANILHA123/edit";
const DOC = "https://docs.google.com/document/d/DOC123/edit";

/** Planilha falsa: linha 5 em diante; guarda as escritas por faixa. */
function planilhaFalsa(linhas) {
  const escritas = [];
  return {
    escritas,
    async obterValores(_id, faixa) { return /!A4:L4$/.test(faixa) ? [["Nº", "Vaga", "Link da vaga"]] : linhas; },
    async escreverValores(_id, faixa, valores) { escritas.push({ faixa: faixa.split("!")[1], valores }); }
  };
}

function montar({ dryRun = false, autoSubmit = true, linhas }) {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), "ap-"));
  const config = montarConfig({ AUTO_SUBMIT: String(autoSubmit), OUTPUT_DIR: saida, GOOGLE_SHEET_URL: SHEET, GOOGLE_DOC_CV_BASE_URL: DOC, APPLY_HEADLESS: "true" }, { dryRun });
  const aberturas = [];
  const paginas = [];
  const contexto = new EventEmitter();
  contexto.pages = () => paginas.filter((p) => !p.fechada);
  contexto.newPage = async () => {
    const p = { visitadas: [], fechada: false, async goto(u) { this.visitadas.push(u); }, async waitForLoadState() {}, async close() { this.fechada = true; } };
    paginas.push(p);
    return p;
  };
  contexto.close = async () => { contexto.emit("close"); };
  const cliente = planilhaFalsa(linhas);
  const deps = (candidatar) => ({
    clienteSheets: cliente, candidatar,
    abrir: async (o) => { aberturas.push(o); return contexto; },
    lerComplementares: () => ({ dados: { cpf: "000.000.000-00" }, existe: true })
  });
  return { config, cliente, deps, aberturas, paginas, saida };
}

const LINHA = (n, titulo, url, situacao = "Se candidatar", k = "", l = "") => [String(n), titulo, url, "Acme Exemplo", "Busca automática - Gupy", "", "", "Sim", situacao, "Assim que possível", k, l];

// O Perfil vem do parser real, com o currículo FICTÍCIO da fixture A.
const { TEXTO_A } = require("../fixtures-curriculo");

async function rodar(cenario, candidatar) {
  const etapa = criarEtapaCandidatura({ ...cenario.deps(candidatar), lerTexto: async () => TEXTO_A });
  const resultado = resultadoVazio();
  await etapa({ config: cenario.config, resultado, logs, saida: () => {} });
  return resultado;
}

test("A26: montarObservacoes acrescenta CV e Recibo ao fim, sem apagar alerta, e substitui o sufixo antigo", () => {
  assert.strictEqual(montarObservacoes("Exige bacharelado", { cv: "output/cvs/01-a.pdf", recibo: "output/receipts/01-a-recibo.png" }),
    "Exige bacharelado | CV: output/cvs/01-a.pdf | Recibo: output/receipts/01-a-recibo.png");
  assert.strictEqual(montarObservacoes("", { cv: "output/cvs/01-a.pdf", recibo: null }), "CV: output/cvs/01-a.pdf");
  assert.strictEqual(
    montarObservacoes("Alerta X | CV: output/cvs/velho.pdf | Recibo: output/receipts/velho.png", { cv: "output/cvs/novo.pdf", recibo: "output/receipts/novo.png" }),
    "Alerta X | CV: output/cvs/novo.pdf | Recibo: output/receipts/novo.png"
  );
});

test("A26: atualizarCandidatura escreve I, K e L da linha certa e preserva J", async () => {
  const cliente = planilhaFalsa([LINHA(1, "A", "https://x.exemplo/1"), LINHA(2, "B", "https://x.exemplo/2", "Se candidatar", "CV gerado", "Aviso antigo")]);
  assert.strictEqual(await atualizarCandidatura(cliente, "ID", "https://x.exemplo/2/?utm_source=a", { enviada: true, status: "Candidatura enviada - CV adaptado", cv: "output/cvs/b.pdf", recibo: "output/receipts/b.png" }), true);
  assert.deepStrictEqual(cliente.escritas, [
    { faixa: "I6:I6", valores: [["Candidatura enviada"]] },
    { faixa: "K6:L6", valores: [["Candidatura enviada - CV adaptado", "Aviso antigo | CV: output/cvs/b.pdf | Recibo: output/receipts/b.png"]] }
  ]);
  assert.strictEqual(await atualizarCandidatura(cliente, "ID", "https://nao-esta/na/planilha", { enviada: false, status: "x" }), false);
});

test("A28: vaga já enviada não volta; Pendência de candidatura não pede CV de novo", async () => {
  const cliente = planilhaFalsa([
    LINHA(1, "Enviada", "https://x.exemplo/1", "Candidatura enviada"),
    LINHA(2, "Aberta", "https://x.exemplo/2"),
    LINHA(3, "Com pendência", "https://x.exemplo/3", "Se candidatar", "Pendência: aceite de termos")
  ]);
  assert.deepStrictEqual((await lerVagasParaCandidatar(cliente, "ID")).map((v) => v.titulo), ["Aberta", "Com pendência"]);
  assert.deepStrictEqual((await lerPendentesDeCurriculo(cliente, "ID")).map((v) => v.titulo), ["Aberta"]);
});

test("A11: o manifesto liga o PDF à vaga pela URL; vaga sem CV não ganha o de outra", () => {
  const config = { pastas: { curriculos: fs.mkdtempSync(path.join(os.tmpdir(), "cvs-")) } };
  const pdf = path.join(config.pastas.curriculos, "01-vaga-a.pdf");
  fs.writeFileSync(pdf, "%PDF");
  registrarCv(config, "https://x.exemplo/vaga/a?utm_source=z", pdf);
  assert.strictEqual(cvDaVaga(config, "https://x.exemplo/vaga/a"), pdf);
  assert.strictEqual(cvDaVaga(config, "https://x.exemplo/vaga/b"), null);
});

test("A24, A26, A29: enviada atualiza I, K e L, conta no resumo e não gera Pendência; uma vaga ruim não derruba as outras", async () => {
  const cenario = montar({ linhas: [LINHA(1, "Dev A", "https://empresa.gupy.io/jobs/1", "Se candidatar", "CV gerado - aguardando revisão", "Alerta P11")], });
  cenario.cliente.escritas.length = 0;
  const cv = path.join(cenario.config.pastas.curriculos, "01-dev-a.pdf");
  fs.mkdirSync(cenario.config.pastas.curriculos, { recursive: true });
  fs.writeFileSync(cv, "%PDF");
  registrarCv(cenario.config, "https://empresa.gupy.io/jobs/1", cv);
  const recibo = path.join(cenario.config.pastas.recibos, "01-dev-a-recibo.png");
  const chamadas = [];
  const r = await rodar(cenario, async (pagina, opcoes) => {
    chamadas.push(opcoes);
    return { resultado: "enviada", motivos: [], preenchidos: 5, recibo, protocolo: null };
  });
  assert.strictEqual(r.enviadas, 1);
  assert.strictEqual(r.pendencias, 0);
  assert.strictEqual(chamadas[0].cvPath, cv); // o PDF desta vaga
  assert.strictEqual(chamadas[0].enviar, true);
  assert.ok(chamadas[0].dominiosPermitidos.includes("empresa.gupy.io") && chamadas[0].dominiosPermitidos.includes("indeed.com") && !chamadas[0].dominiosPermitidos.includes("trampos.co"));
  assert.deepStrictEqual(cenario.cliente.escritas.map((e) => e.faixa), ["I5:I5", "K5:L5"]);
  assert.strictEqual(cenario.cliente.escritas[0].valores[0][0], "Candidatura enviada");
  const l = cenario.cliente.escritas[1].valores[0];
  assert.strictEqual(l[0], "Candidatura enviada - CV adaptado");
  assert.match(l[1], /^Alerta P11 \| CV: .*\/cvs\/01-dev-a\.pdf \| Recibo: .*\/receipts\/01-dev-a-recibo\.png$/);
  assert.ok(!l[1].includes(os.tmpdir().replace(/\\/g, "/")) && !/[A-Za-z]:\//.test(l[1]), "sem diretório do usuário na planilha");
  assert.deepStrictEqual(logs.ler(cenario.config.pastas.logs, "pendencias"), []);
  assert.match(formatarResumo(r, { dryRun: false, enviarCandidatura: true }), /1 enviada\(s\), 0 pendência\(s\)/);
});

test("A25, A26: Pendência vira linha em pendencias.jsonl, status na planilha e I continua \"Se candidatar\"", async () => {
  const cenario = montar({ linhas: [LINHA(1, "Dev B", "https://forms.exemplo.com/vaga/2")] });
  const recibo = path.join(cenario.config.pastas.recibos, "01-dev-b-pendencia.png");
  const r = await rodar(cenario, async () => ({ resultado: "pendencia", motivos: [{ motivo: "aceite de termos", campo: "Li e aceito os termos" }], preenchidos: 4, recibo, protocolo: null }));
  assert.strictEqual(r.pendencias, 1);
  assert.strictEqual(r.enviadas, 0);
  const [registro] = logs.ler(cenario.config.pastas.logs, "pendencias");
  assert.strictEqual(registro.motivo, "aceite de termos");
  assert.strictEqual(registro.detalhe, "Li e aceito os termos");
  assert.strictEqual(registro.fonte, "formulário web");
  assert.match(registro.recibo, /receipts\/01-dev-b-pendencia\.png$/);
  assert.strictEqual(cenario.cliente.escritas[0].valores[0][0], "Se candidatar");
  assert.match(cenario.cliente.escritas[1].valores[0][0], /^Pendência: aceite de termos \(Li e aceito os termos\)$/);
});

test("A23: o CPF e os demais Dados Complementares nunca vão para log, planilha ou resumo", async () => {
  const cenario = montar({ linhas: [LINHA(1, "Dev C", "https://forms.exemplo.com/vaga/3")] });
  const r = await rodar(cenario, async (pagina, opcoes) => {
    assert.strictEqual(opcoes.dados.cpf, "000.000.000-00"); // o motor recebe o dado...
    return { resultado: "pendencia", motivos: [{ motivo: "campo obrigatório sem dado", campo: "CPF" }], preenchidos: 1, recibo: null, protocolo: null };
  });
  const tudo = JSON.stringify(cenario.cliente.escritas) + JSON.stringify(logs.ler(cenario.config.pastas.logs, "pendencias")) + formatarResumo(r, { dryRun: false, enviarCandidatura: true });
  assert.ok(!tudo.includes("000.000.000-00")); // ...mas ele não sai daqui
});

test("A27: --dry-run não escreve na planilha nem em pendencias.jsonl, e a Tentativa é só simulada", async () => {
  const cenario = montar({ dryRun: true, linhas: [LINHA(1, "Dev D", "https://forms.exemplo.com/vaga/4"), LINHA(2, "Dev E", "https://forms.exemplo.com/vaga/5")] });
  const modos = [];
  const r = await rodar(cenario, async (pagina, opcoes) => {
    modos.push([opcoes.dryRun, opcoes.enviar]);
    return modos.length === 1
      ? { resultado: "simulada", motivos: [], preenchidos: 3, recibo: null, protocolo: null }
      : { resultado: "pendencia", motivos: [{ motivo: "aceite de termos" }], preenchidos: 3, recibo: null, protocolo: null };
  });
  assert.deepStrictEqual(modos, [[true, false], [true, false]]); // AUTO_SUBMIT=true, mas dry-run vence
  assert.strictEqual(r.simuladas, 1);
  assert.deepStrictEqual(cenario.cliente.escritas, []);
  assert.deepStrictEqual(logs.ler(cenario.config.pastas.logs, "pendencias"), []);
  assert.ok(cenario.paginas.every((p) => p.fechada), "dry-run fecha as abas");
});

test("A29: erro numa vaga vira Pendência e as demais continuam; o texto do erro não vai para o log", async () => {
  const cenario = montar({ linhas: [LINHA(1, "Dev F", "https://forms.exemplo.com/vaga/6"), LINHA(2, "Dev G", "https://forms.exemplo.com/vaga/7")] });
  let n = 0;
  const r = await rodar(cenario, async () => {
    n += 1;
    if (n === 1) throw new Error("Falhou ao ler 000.000.000-00 da página");
    return { resultado: "enviada", motivos: [], preenchidos: 2, recibo: null, protocolo: null };
  });
  assert.strictEqual(r.pendencias, 1);
  assert.strictEqual(r.enviadas, 1);
  assert.ok(!JSON.stringify(logs.ler(cenario.config.pastas.logs, "pendencias")).includes("000.000.000-00"));
});

test("sessão: o navegador abre na pasta da Sessão; visível por padrão, escondido com APPLY_HEADLESS=true", async () => {
  const cenario = montar({ linhas: [LINHA(1, "Dev H", "https://forms.exemplo.com/vaga/8")] });
  await rodar(cenario, async () => ({ resultado: "simulada", motivos: [], preenchidos: 0, recibo: null, protocolo: null }));
  assert.deepStrictEqual(cenario.aberturas, [{ pasta: cenario.config.pastas.sessaoNavegador, visivel: false }]); // headless no teste
  assert.strictEqual(montarConfig({}).apply.headless, false);
});

test("sem vagas \"Se candidatar\", não abre o navegador", async () => {
  const cenario = montar({ linhas: [LINHA(1, "Já enviada", "https://x.exemplo/1", "Candidatura enviada")] });
  const r = await rodar(cenario, async () => assert.fail("não deveria chamar"));
  assert.deepStrictEqual(cenario.aberturas, []);
  assert.ok(r.avisosPerfil.some((a) => /Nenhuma vaga/.test(a)));
});

