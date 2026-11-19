// Testes do Perfil determinístico (PF1 a PF7): Doc falso, sem LLM e sem rede; só dados fictícios.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { extrairTexto, lerTextoDoc } = require("../../pipeline/google-docs");
const { acharEmail, acharTelefone, acharLinkedin, acharGithub } = require("../../pipeline/perfil/regras");
const { parsearPerfil, tituloDeSecao, cabecalhoDoItem, parsearLinhaDeFormacao } = require("../../pipeline/perfil/parser");
const { extrairPerfil, obterPerfil, perfilParaRadar } = require("../../pipeline/perfil");
const { TEXTO_A, TEXTO_B, PERFIL } = require("./fixtures-curriculo");

const pastaTemp = () => fs.mkdtempSync(path.join(os.tmpdir(), "perfil-"));

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

test("PF2: regras determinísticas de contato", () => {
  assert.strictEqual(acharEmail("fale: maria.exemplo@exemplo.com.br!"), "maria.exemplo@exemplo.com.br");
  assert.strictEqual(acharEmail("sem e-mail"), null);
  assert.strictEqual(acharTelefone("Cel: (61) 99999-0000"), "(61) 99999-0000");
  assert.strictEqual(acharTelefone("+55 61 3333-4444"), "+55 61 3333-4444");
  assert.strictEqual(acharLinkedin("linkedin.com/in/maria-exemplo/"), "https://linkedin.com/in/maria-exemplo/");
  assert.strictEqual(acharGithub("github.com/mariaexemplo/repositorio-x"), "https://github.com/mariaexemplo");
  assert.strictEqual(acharGithub("sem github"), null);
});

test("títulos de seção: aceita variações e ignora linhas comuns", () => {
  assert.strictEqual(tituloDeSecao("FORMAÇÃO"), "formacao");
  assert.strictEqual(tituloDeSecao("Formação Acadêmica:"), "formacao");
  assert.strictEqual(tituloDeSecao("Experiência Profissional"), "experiencia");
  assert.strictEqual(tituloDeSecao("Projetos"), "projetos");
  assert.strictEqual(tituloDeSecao("Habilidades Técnicas"), "habilidades");
  assert.strictEqual(tituloDeSecao("Idiomas"), "idiomas");
  assert.strictEqual(tituloDeSecao("Resumo Profissional"), "ignorar");
  assert.strictEqual(tituloDeSecao("Criei telas em React"), null);
  assert.strictEqual(tituloDeSecao("- Projetos"), null);
});

test("cabeçalho de item: cargo, organização e período em vários formatos", () => {
  assert.deepStrictEqual(cabecalhoDoItem("Estagiária - Acme Exemplo - 2024 - 2025"), { titulo: "Estagiária", organizacao: "Acme Exemplo", periodo: "2024 - 2025" });
  assert.deepStrictEqual(cabecalhoDoItem("Acme Exemplo | Jan 2024 – Dez 2024"), { titulo: "Acme Exemplo", organizacao: null, periodo: "Jan 2024 – Dez 2024" });
  assert.deepStrictEqual(cabecalhoDoItem("Painel de Vagas (2025)"), { titulo: "Painel de Vagas", organizacao: null, periodo: "2025" });
  assert.strictEqual(cabecalhoDoItem("Dev - Beta Exemplo - 03/2023 - atual").periodo, "03/2023 - atual");
});

test("formação: grau, curso, instituição, status e previsão em uma linha ou em várias", () => {
  assert.deepStrictEqual(parsearLinhaDeFormacao("Bacharelado em Ciência da Computação - Faculdade Exemplo - concluído"), {
    instituicao: "Faculdade Exemplo", curso: "Ciência da Computação", grau: "Bacharelado", status: "concluído", previsaoConclusao: null
  });
  assert.strictEqual(parsearLinhaDeFormacao("Licenciatura em Computação (UnB), 2025 - 2029, cursando").instituicao, "UnB");
  assert.strictEqual(parsearLinhaDeFormacao("Licenciatura em Computação (UnB), 2025 - 2029, cursando").previsaoConclusao, "2029");
  assert.strictEqual(parsearLinhaDeFormacao("Tecnologia em Sistemas - Instituto Exemplo").grau, "Tecnologia");
});

test("PF2 e PF4: formato A (títulos em maiúsculas, uma linha por item)", () => {
  const { perfil, avisos } = parsearPerfil(TEXTO_A);
  assert.deepStrictEqual(perfil, PERFIL);
  assert.deepStrictEqual(avisos, []);
});

test("PF2 e PF4: formato B (acentos, dois-pontos, cabeçalho em duas linhas, marcadores, rótulos)", () => {
  const { perfil } = parsearPerfil(TEXTO_B);
  assert.deepStrictEqual(perfil.identificacao, {
    nome: "MARIA EXEMPLO", email: "maria.exemplo@exemplo.com", telefone: "+55 61 98888-7777", cidade: "Brasília", estado: "DF",
    regiaoAdministrativa: null, linkedin: "https://www.linkedin.com/in/maria-exemplo", github: "https://github.com/mariaexemplo",
    portfolio: "https://maria.exemplo.dev"
  });
  assert.deepStrictEqual(perfil.formacao, [{ instituicao: "Universidade Exemplo", curso: "Computação", grau: "Licenciatura", status: null, previsaoConclusao: "dez/2029" }]);
  assert.strictEqual(perfil.experiencias.length, 2);
  assert.deepStrictEqual(perfil.experiencias[0], {
    tipo: "experiencia", titulo: "Desenvolvedora Júnior", organizacao: "Acme Exemplo", periodo: "Jan 2024 – Dez 2024",
    descricao: ["Construí APIs com Node.js e Express.", "Escrevi testes com Jest."], tecnologias: ["Node.js", "Express", "Jest"]
  });
  assert.deepStrictEqual(perfil.experiencias[1], {
    tipo: "projeto", titulo: "Painel de Vagas", organizacao: null, periodo: "2025",
    descricao: ["Interface em React com dados em MySQL."], tecnologias: [] // React e MySQL não estão na lista de habilidades do Doc
  });
  assert.deepStrictEqual(perfil.habilidades, {
    tecnicas: ["JavaScript", "TypeScript", "Python"], ferramentas: ["Git", "Docker"], idiomas: ["Inglês - intermediário", "Espanhol - básico"]
  });
});

test("PF3: todo valor do Perfil é trecho do próprio Doc (Ancoragem por construção)", () => {
  for (const texto of [TEXTO_A, TEXTO_B]) {
    const { perfil } = parsearPerfil(texto);
    const base = texto.replace(/\s+/g, " ");
    const valores = [
      ...Object.values(perfil.identificacao), ...perfil.formacao.flatMap((f) => Object.values(f)),
      ...perfil.experiencias.flatMap((e) => [e.titulo, e.organizacao, e.periodo, ...e.descricao, ...e.tecnologias]),
      ...perfil.habilidades.tecnicas, ...perfil.habilidades.ferramentas, ...perfil.habilidades.idiomas
    ].filter(Boolean);
    for (const v of valores) {
      // contatos normalizados (https:// acrescentado) são os únicos que podem não aparecer literalmente
      assert.ok(base.includes(String(v).replace(/^https:\/\//, "")) || base.includes(String(v)), `não achei no Doc: ${v}`);
    }
  }
});

test("PF4: o que não está no Doc fica nulo ou vazio, sem suposição", () => {
  const texto = TEXTO_A.replace(/LinkedIn \(.*\)\n/, "").replace("github.com/mariaexemplo\n", "");
  const { perfil } = parsearPerfil(texto);
  assert.strictEqual(perfil.identificacao.linkedin, null);
  assert.strictEqual(perfil.identificacao.github, null);
  assert.strictEqual(perfil.identificacao.portfolio, null);
  assert.strictEqual(perfil.identificacao.regiaoAdministrativa, null);
});

test("PF4: seção ausente vira aviso, não invenção", () => {
  const { perfil, avisos } = parsearPerfil(TEXTO_A.replace(/PROJETOS[\s\S]*?(?=HABILIDADES)/, ""));
  assert.strictEqual(perfil.experiencias.filter((e) => e.tipo === "projeto").length, 0);
  assert.deepStrictEqual(avisos, ["Não achei a seção Projetos no Currículo Base."]);
});

test("PF5: Doc vazio, sem seções, sem nome ou sem itens para a Etapa com erro claro", () => {
  assert.throws(() => extrairPerfil("  "), /vazio ou curto/);
  assert.throws(() => extrairPerfil("Maria Exemplo\nmaria@exemplo.com\nTexto corrido sem nenhuma seção reconhecível aqui."), /nenhuma seção/);
  assert.throws(() => extrairPerfil("FORMAÇÃO\nLicenciatura em Computação - Universidade Exemplo\nHABILIDADES\nReact"), /nome/);
  assert.throws(() => extrairPerfil("Maria Exemplo\nFORMAÇÃO\n\nEXPERIÊNCIA\n\nHABILIDADES\n\nPROJETOS\n"), /nenhum item/);
});

test("PF5: o Perfil passa pelo schema Zod", () => {
  const { perfil } = extrairPerfil(TEXTO_A);
  assert.deepStrictEqual(perfil, PERFIL);
});

test("obterPerfil lê o Doc, valida e grava output/perfil.json para conferência", async () => {
  const pastaSaida = pastaTemp();
  const { perfil } = await obterPerfil({ lerTexto: async () => TEXTO_A, pastaSaida });
  assert.strictEqual(perfil.identificacao.nome, "Maria Exemplo");
  const salvo = JSON.parse(fs.readFileSync(path.join(pastaSaida, "perfil.json"), "utf8"));
  assert.deepStrictEqual(salvo.perfil, perfil);
  await assert.rejects(obterPerfil({ lerTexto: async () => "", pastaSaida }), /vazio ou curto/);
});

test("PF7: o Perfil entrega ao Radar as habilidades e o grau da formação em andamento", () => {
  const p = perfilParaRadar(PERFIL);
  assert.ok(p.habilidades.includes("React") && p.habilidades.includes("Express"));
  assert.strictEqual(new Set(p.habilidades).size, p.habilidades.length);
  assert.strictEqual(p.formacao.grau, "Licenciatura");
  assert.strictEqual(perfilParaRadar({ ...PERFIL, formacao: [] }).formacao, null);
});

// ---- Formato C: o estilo de um currículo real (todos os nomes fictícios) ----
const TEXTO_C = `MARIA EXEMPLO
maria.exemplo@exemplo.com | (61) 99999-0000 | Brasília - DF

RESUMO
Texto de apresentação que o Pipeline não usa.

EDUCAÇÃO
Graduação em Computação (Licenciatura) – Universidade Exemplo (UEx) | Mar/2025 – Atual
Técnico em Desenvolvimento Web (400h) – Escola Exemplo | Jul/2024 – Dez/2024
• Tecnologias: HTML, CSS e JavaScript.
• Projeto final em equipe; participação em feira de ciências.
Formação em Back-end – Plataforma Exemplo | Jan/2025 – Atual

EXPERIÊNCIA PROFISSIONAL
Estagiária - Acme Exemplo - 2024 - 2025
- Criei telas em React.

HABILIDADES TÉCNICAS
• Linguagens: JavaScript, Python, C++
• Práticas: Git; testes automatizados (Jest, Vitest)
• Idiomas: Português (nativo); Inglês (avançado, leitura e escrita); Espanhol (básico)

FERRAMENTAS
• Figma, Docker

CURSOS E CERTIFICAÇÕES
Curso de Exemplo – Plataforma Exemplo | 2024
`;

test("idiomas: vírgula dentro de parênteses não quebra o item", () => {
  const { perfil } = parsearPerfil(TEXTO_C);
  assert.deepStrictEqual(perfil.habilidades.idiomas, ["Português (nativo)", "Inglês (avançado, leitura e escrita)", "Espanhol (básico)"]);
});

test("habilidades: parênteses com vírgula ficam inteiros e 'Ferramentas' é um título de habilidades", () => {
  const { perfil } = parsearPerfil(TEXTO_C);
  assert.ok(perfil.habilidades.tecnicas.includes("testes automatizados (Jest, Vitest)"));
  assert.ok(perfil.habilidades.tecnicas.includes("C++"));
  assert.ok(perfil.habilidades.tecnicas.includes("Figma") && perfil.habilidades.tecnicas.includes("Docker"));
  assert.ok(!perfil.habilidades.idiomas.some((i) => /Figma|Docker|Curso/.test(i)));
});

test("formação: cada linha datada é uma formação; tópicos com marcador não viram formação; grau específico entre parênteses", () => {
  const { perfil } = parsearPerfil(TEXTO_C);
  assert.strictEqual(perfil.formacao.length, 3);
  assert.deepStrictEqual(perfil.formacao[0], {
    instituicao: "Universidade Exemplo", curso: "Computação", grau: "Licenciatura", status: "Atual", previsaoConclusao: null
  });
  assert.strictEqual(perfil.formacao[1].grau, "Técnico");
  assert.strictEqual(perfil.formacao[1].instituicao, "Escola Exemplo");
  assert.strictEqual(perfil.formacao[2].instituicao, "Plataforma Exemplo"); // sem a palavra "Universidade": sobrou depois do curso
  assert.strictEqual(perfil.formacao[2].curso, "Formação em Back-end");
});

test("o grau da formação principal chega ao Radar como Licenciatura", () => {
  const { perfil } = extrairPerfil(TEXTO_C);
  assert.strictEqual(perfilParaRadar(perfil).formacao.grau, "Licenciatura");
});

test("título desconhecido em maiúsculas encerra Idiomas/Habilidades em vez de virar item", () => {
  const texto = TEXTO_A.replace("Idiomas: Inglês intermediário\n", "Idiomas: Inglês intermediário\n\nOUTRAS INFORMAÇÕES\nDisponibilidade para viagens\n");
  const { perfil } = parsearPerfil(texto);
  assert.deepStrictEqual(perfil.habilidades.idiomas, ["Inglês intermediário"]);
  assert.ok(!perfil.habilidades.tecnicas.includes("Disponibilidade para viagens"));
});
