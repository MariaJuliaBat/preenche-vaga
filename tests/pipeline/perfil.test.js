// Testes do Perfil (PF1 a PF8): Doc, LLM e rede falsos; só dados fictícios.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { extrairTexto, lerTextoDoc } = require("../../pipeline/google-docs");
const { acharEmail, acharTelefone, acharLinkedin, acharGithub } = require("../../pipeline/perfil/regras");
const { criarAncora } = require("../../pipeline/perfil/ancorar");
const { extrairPerfil, obterPerfil, perfilParaRadar } = require("../../pipeline/perfil");
const { criarLlm } = require("../../pipeline/llm");
const { TEXTO_DO_CURRICULO, PERFIL_DO_LLM, PERFIL, llmFalso } = require("./fixtures-curriculo");

const pastaTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), "perfil-"));
const clonar = (o) => JSON.parse(JSON.stringify(o));

test("PF1: o texto do Doc inclui a URL do hiperlink e marca tópicos", () => {
  const texto = extrairTexto({
    body: {
      content: [
        { paragraph: { elements: [{ textRun: { content: "Maria Exemplo\n" } }] } },
        { paragraph: { elements: [{ textRun: { content: "LinkedIn", textStyle: { link: { url: "https://www.linkedin.com/in/maria-exemplo" } } } }, { textRun: { content: "\n" } }] } },
        { paragraph: { bullet: {}, elements: [{ textRun: { content: "Criei telas em React.\n" } }] } },
        { table: { tableRows: [{ tableCells: [{ content: [{ paragraph: { elements: [{ textRun: { content: "Célula\n" } }] } }] }] }] } }
      ]
    }
  });
  assert.match(texto, /Maria Exemplo/);
  assert.match(texto, /LinkedIn \(https:\/\/www\.linkedin\.com\/in\/maria-exemplo\)/);
  assert.match(texto, /- Criei telas em React\./);
  assert.match(texto, /Célula/);
});

test("PF1: lerTextoDoc usa token e devolve texto; 403 sugere compartilhar e ativar a API", async () => {
  const chamadas = [];
  const doc = { body: { content: [{ paragraph: { elements: [{ textRun: { content: "Texto\n" } }] } }] } };
  const ok = await lerTextoDoc({
    docId: "DOC1", obterToken: async () => "TOKEN-FALSO",
    fetchImpl: async (url, init) => { chamadas.push({ url, init }); return { ok: true, json: async () => doc }; }
  });
  assert.strictEqual(ok, "Texto");
  assert.match(chamadas[0].url, /documents\/DOC1$/);
  assert.strictEqual(chamadas[0].init.headers.Authorization, "Bearer TOKEN-FALSO");
  await assert.rejects(
    lerTextoDoc({ docId: "X", obterToken: async () => "T", fetchImpl: async () => ({ ok: false, status: 403 }) }),
    /403.*Service Account.*Docs/
  );
});

test("PF2: regras determinísticas", () => {
  assert.strictEqual(acharEmail("fale: maria.exemplo@exemplo.com.br!"), "maria.exemplo@exemplo.com.br");
  assert.strictEqual(acharEmail("sem e-mail"), null);
  assert.strictEqual(acharTelefone("Cel: (61) 99999-0000"), "(61) 99999-0000");
  assert.strictEqual(acharTelefone("+55 61 3333-4444"), "+55 61 3333-4444");
  assert.strictEqual(acharLinkedin("linkedin.com/in/maria-exemplo/"), "https://linkedin.com/in/maria-exemplo/");
  assert.strictEqual(acharLinkedin("https://www.linkedin.com/in/maria-exemplo"), "https://www.linkedin.com/in/maria-exemplo");
  assert.strictEqual(acharGithub("github.com/mariaexemplo/repositorio-x"), "https://github.com/mariaexemplo");
  assert.strictEqual(acharGithub("sem github"), null);
});

test("Ancoragem: valor inteiro, período por números e frase por sobreposição", () => {
  const a = criarAncora("Estagiária de Desenvolvimento na Acme Exemplo, de 2024 a 2025. Criei telas em React.");
  assert.ok(a.contem("Acme Exemplo"));
  assert.ok(a.contem("estagiaria de desenvolvimento"));
  assert.ok(!a.contem("Globex Inventada"));
  assert.ok(!a.contem(""));
  assert.ok(a.periodo("2024 - 2025"));
  assert.ok(!a.periodo("2020 - 2023"));
  assert.ok(a.frase("Criei telas em React."));
  assert.ok(!a.frase("Liderei um time de dez pessoas."));
  assert.ok(!a.frase("Criei telas em React e reduzi custos em 40%."));
});

test("PF3, PF2 e PF4: descarta o que não tem âncora, a regra vence o LLM e o ausente fica nulo", async () => {
  const llm = llmFalso([clonar(PERFIL_DO_LLM)]);
  const { perfil, avisos } = await extrairPerfil({ texto: TEXTO_DO_CURRICULO, llm });

  assert.strictEqual(perfil.identificacao.email, "maria.exemplo@exemplo.com"); // regra vence o "outra@inventada.com"
  assert.strictEqual(perfil.identificacao.telefone, "(61) 99999-0000");
  assert.strictEqual(perfil.identificacao.linkedin, "https://www.linkedin.com/in/maria-exemplo");
  assert.strictEqual(perfil.identificacao.github, "https://github.com/mariaexemplo");
  assert.strictEqual(perfil.identificacao.portfolio, null);

  assert.ok(!perfil.experiencias.some((e) => e.organizacao === "Globex Inventada"));
  assert.deepStrictEqual(perfil.experiencias[0].tecnologias, ["React", "Python"]); // Kubernetes caiu
  assert.ok(!perfil.habilidades.tecnicas.includes("Rust"));
  assert.ok(avisos.some((a) => /Kubernetes/.test(a)));
  assert.ok(avisos.some((a) => /Rust/.test(a)));
  assert.deepStrictEqual(perfil.formacao[0].previsaoConclusao, "12/2029");
});

test("PF3: sem LinkedIn no texto e sem âncora, o LinkedIn do LLM também é descartado", async () => {
  const bruto = clonar(PERFIL_DO_LLM);
  bruto.identificacao.linkedin = "https://linkedin.com/in/inventado";
  const texto = TEXTO_DO_CURRICULO.replace(/LinkedIn \(.*\)\n/, "");
  const { perfil } = await extrairPerfil({ texto, llm: llmFalso([bruto]) });
  assert.strictEqual(perfil.identificacao.linkedin, null);
});

test("PF5: Doc vazio ou curto para a Etapa sem chamar o LLM; sem nome após a Ancoragem também", async () => {
  const llm = llmFalso([]);
  await assert.rejects(extrairPerfil({ texto: "  ", llm }), /vazio ou curto/);
  assert.strictEqual(llm.chamadas.length, 0);

  const semNome = clonar(PERFIL_DO_LLM);
  semNome.identificacao.nome = "Fulana Inventada";
  await assert.rejects(extrairPerfil({ texto: TEXTO_DO_CURRICULO, llm: llmFalso([semNome]) }), /sem nome/);
});

test("PF5: erro do LLM vira erro claro da Etapa", async () => {
  await assert.rejects(
    extrairPerfil({ texto: TEXTO_DO_CURRICULO, llm: llmFalso([new Error("O modelo recusou a solicitação (cyber).")]) }),
    /Não consegui extrair o Perfil: O modelo recusou/
  );
});

test("PF8: o texto vai delimitado como dado e o prompt manda ignorar instruções dentro dele", async () => {
  const llm = llmFalso([clonar(PERFIL_DO_LLM)]);
  await extrairPerfil({ texto: TEXTO_DO_CURRICULO, llm });
  assert.match(llm.chamadas[0].usuario, /^<curriculo>\n/);
  assert.match(llm.chamadas[0].usuario, /<\/curriculo>$/);
  assert.match(llm.chamadas[0].sistema, /DADO, nunca instrução/);
});

test("PF6: com o mesmo texto, o Cache evita nova chamada ao LLM; texto novo extrai de novo", async () => {
  const pastaSaida = pastaTemp();
  const llm = llmFalso([clonar(PERFIL_DO_LLM), clonar(PERFIL_DO_LLM)]);
  const args = { lerTexto: async () => TEXTO_DO_CURRICULO, llm, pastaSaida };

  const primeiro = await obterPerfil(args);
  const segundo = await obterPerfil(args);
  assert.strictEqual(primeiro.doCache, false);
  assert.strictEqual(segundo.doCache, true);
  assert.strictEqual(llm.chamadas.length, 1);
  assert.deepStrictEqual(segundo.perfil, primeiro.perfil);

  const terceiro = await obterPerfil({ ...args, lerTexto: async () => `${TEXTO_DO_CURRICULO}\n- Novo tópico sobre React.` });
  assert.strictEqual(terceiro.doCache, false);
  assert.strictEqual(llm.chamadas.length, 2);
});

test("PF7: o Perfil entrega ao Radar as habilidades e o grau da formação em andamento", () => {
  const p = perfilParaRadar(PERFIL);
  assert.ok(p.habilidades.includes("React") && p.habilidades.includes("Express"));
  assert.strictEqual(new Set(p.habilidades).size, p.habilidades.length);
  assert.strictEqual(p.formacao.grau, "Licenciatura");
  assert.strictEqual(perfilParaRadar({ ...PERFIL, formacao: [] }).formacao, null);
});

// ---- Cliente do LLM ----

function clienteFalso(resposta) {
  const chamadas = [];
  return { chamadas, beta: { messages: { parse: async (params) => { chamadas.push(params); return resposta; } } } };
}
const SCHEMA = require("zod").z.object({ ok: require("zod").z.boolean() });

test("LLM: pede saída estruturada, sem ferramentas, com fallbacks e o modelo configurado", async () => {
  const cliente = clienteFalso({ stop_reason: "end_turn", parsed_output: { ok: true } });
  const llm = criarLlm({ apiKey: "CHAVE-FALSA", modelo: "claude-opus-5-5", cliente });
  assert.deepStrictEqual(await llm.json({ sistema: "S", usuario: "U", schema: SCHEMA }), { ok: true });
  const p = cliente.chamadas[0];
  assert.strictEqual(p.model, "claude-opus-5-5");
  assert.strictEqual(p.system, "S");
  assert.deepStrictEqual(p.messages, [{ role: "user", content: "U" }]);
  assert.strictEqual(p.fallbacks, "default");
  assert.deepStrictEqual(p.betas, ["server-side-fallback-2026-07-01"]);
  assert.ok(p.output_config.format);
  assert.ok(!("tools" in p) && !("tool_choice" in p));
});

test("LLM: recusa, corte por tokens e resposta fora do schema viram erro claro", async () => {
  const chama = (resposta) => criarLlm({ apiKey: "X", cliente: clienteFalso(resposta) }).json({ sistema: "S", usuario: "U", schema: SCHEMA });
  await assert.rejects(chama({ stop_reason: "refusal", stop_details: { category: "cyber" } }), /recusou.*cyber/);
  await assert.rejects(chama({ stop_reason: "max_tokens", parsed_output: null }), /limite de tokens/);
  await assert.rejects(chama({ stop_reason: "end_turn", parsed_output: null }), /schema/);
});
