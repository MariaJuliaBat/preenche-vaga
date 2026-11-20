// Etapa 1 do Auto-Apply: Mapeamento ampliado, Dados Complementares e escolha de opção. Só dados fictícios.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { reconhecerCampo, ehAceite, escolherOpcao, montarDados, formatarValor } = require("../../../pipeline/apply/campos");
const { lerComplementares } = require("../../../pipeline/perfil/complementares");

const raiz = path.join(__dirname, "..", "..", "..");

const PERFIL = {
  identificacao: { nome: "Ana Souza", email: "ana@exemplo.com", telefone: "(11) 99999-0000", cidade: "Brasília", estado: "DF", regiaoAdministrativa: null, linkedin: "linkedin.com/in/ana-exemplo", github: "github.com/ana-exemplo", portfolio: null },
  formacao: [{ instituicao: "Universidade Exemplo", curso: "Computação", grau: "Licenciatura", sigla: null, status: "cursando", previsaoConclusao: "12/2029" }],
  experiencias: [{ tipo: "experiencia", titulo: "Estagiária de TI", organizacao: "Acme Exemplo - Setor X", periodo: "2025", descricao: [], tecnologias: [], links: [] }],
  habilidades: { tecnicas: ["Python"], ferramentas: ["Git"], idiomas: ["Inglês"] }
};

test("A8: o Sinônimo específico vence o genérico", () => {
  assert.strictEqual(reconhecerCampo(["Cidade de nascimento"]), "cidadeNascimento");
  assert.strictEqual(reconhecerCampo(["Cidade"]), "cidade");
  assert.strictEqual(reconhecerCampo(["Nome da mãe"]), "nomeMae");
  assert.strictEqual(reconhecerCampo(["Nome completo"]), "nome");
  assert.strictEqual(reconhecerCampo(["Estado civil"]), "estadoCivil");
  assert.strictEqual(reconhecerCampo(["Estado"]), "estado");
});

test("A8: identificação segue label, name, id, placeholder", () => {
  assert.strictEqual(reconhecerCampo(["E-mail", "nome_do_usuario"]), "email"); // label vence name
  assert.strictEqual(reconhecerCampo(["", "dataNascimento", "x"]), "dataNascimento"); // camelCase
  assert.strictEqual(reconhecerCampo(["", "", "", "Link do seu GitHub"]), "portfolio");
  assert.strictEqual(reconhecerCampo(["Algo sem relação"]), null);
});

test("A7: cobre os Dados Complementares", () => {
  for (const [texto, campo] of [["CPF", "cpf"], ["Data de nascimento", "dataNascimento"], ["Gênero", "genero"], ["Cor ou raça", "autodeclaracao"], ["Pretensão salarial", "pretensaoSalarial"], ["Disponibilidade para iniciar", "disponibilidadeInicio"], ["Horário de preferência", "horarioDisponivel"], ["Modalidade de trabalho", "modalidadePreferida"]]) {
    assert.strictEqual(reconhecerCampo([texto]), campo, texto);
  }
});

test("P26: reconhece Aceite de termos, privacidade e veracidade, e não confunde com campo comum", () => {
  for (const t of ["Li e aceito os termos", "Política de Privacidade (LGPD)", "Declaro que as informações são verdadeiras", "Concordo com o tratamento dos dados"]) {
    assert.strictEqual(ehAceite([t]), true, t);
  }
  assert.strictEqual(ehAceite(["Cidade"]), false);
  assert.strictEqual(ehAceite(["Telefone"]), false);
});

test("P25: escolhe a única opção; sinônimo de valor; ambígua ou ausente devolve null", () => {
  const generos = [{ texto: "Feminino", valor: "f" }, { texto: "Masculino", valor: "m" }, { texto: "Outro", valor: "o" }];
  assert.strictEqual(escolherOpcao(generos, "Feminino"), 0);
  assert.strictEqual(escolherOpcao([{ texto: "Mulher", valor: "1" }, { texto: "Homem", valor: "2" }], "Feminino"), 0); // Feminino ≡ Mulher
  assert.strictEqual(escolherOpcao([{ texto: "Female", valor: "F" }, { texto: "Male", valor: "M" }], "masculino"), 1); // "male" não casa dentro de "female"
  assert.strictEqual(escolherOpcao([{ texto: "Remoto", valor: "r" }, { texto: "Híbrido", valor: "h" }, { texto: "Presencial", valor: "p" }], "Híbrido"), 1);
  assert.strictEqual(escolherOpcao(generos, "Não-binário"), null); // sem correspondência
  assert.strictEqual(escolherOpcao([{ texto: "Cis female", valor: "a" }, { texto: "Trans female", valor: "b" }], "Feminino"), null); // duas: não chuta
});

test("montarDados: usa só o que existe; portfólio cai para o GitHub; nada é suposto", () => {
  const dados = montarDados(PERFIL, { cpf: "000.000.000-00", genero: "Feminino" });
  assert.strictEqual(dados.nome, "Ana Souza");
  assert.strictEqual(dados.estado, "DF");
  assert.strictEqual(dados.portfolio, "github.com/ana-exemplo");
  assert.strictEqual(dados.empresa, "Acme Exemplo");
  assert.strictEqual(dados.curso, "Licenciatura em Computação");
  assert.strictEqual(dados.cpf, "000.000.000-00");
  assert.strictEqual("nomeMae" in dados, false);
  assert.strictEqual("pretensaoSalarial" in dados, false);
});

test("formatarValor: data de nascimento em ISO para input date e DD/MM/AAAA para texto", () => {
  assert.strictEqual(formatarValor("dataNascimento", "2000-01-31", "date"), "2000-01-31");
  assert.strictEqual(formatarValor("dataNascimento", "2000-01-31", "text"), "31/01/2000");
  assert.strictEqual(formatarValor("cpf", "000.000.000-00", "text"), "000.000.000-00");
});

test("A13: o exemplo fictício passa no schema; sem arquivo vira vazio; inválido não vaza o valor", () => {
  const exemplo = lerComplementares(path.join(raiz, "dados-complementares.example.json"));
  assert.strictEqual(exemplo.existe, true);
  assert.strictEqual(exemplo.dados.cpf, "000.000.000-00");
  assert.deepStrictEqual(lerComplementares(path.join(raiz, "secrets", "nao-existe.json")), { dados: {}, existe: false });

  const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "compl-"));
  const ruim = path.join(tmp, "ruim.json");
  fs.writeFileSync(ruim, JSON.stringify({ cpf: "123-segredo" }));
  assert.throws(() => lerComplementares(ruim), (erro) => /cpf/.test(erro.message) && !/segredo/.test(erro.message));
  fs.writeFileSync(ruim, JSON.stringify({ campoNovo: "x" }));
  assert.throws(() => lerComplementares(ruim));
});

test("A12/P27: a extensão não preenche campos que o Mapeamento novo reconhece e o popup não cadastra", () => {
  const codigo = (f) => fs.readFileSync(path.join(raiz, f), "utf8");
  const dom = new JSDOM(`<!doctype html><body><form>
    <label for="a">Nome da mãe</label><input id="a">
    <label for="b">Cidade de nascimento</label><input id="b">
    <label for="c">CPF</label><input id="c">
    <label for="d">Nome completo</label><input id="d">
    <label for="e">Cidade</label><input id="e">
    <label for="f">Gênero</label><select id="f"><option>Feminino</option></select>
    <input type="radio" name="g" value="Feminino" id="g"><input type="checkbox" id="h" name="termos"><input type="file" id="i" name="cv">
  </form></body>`, { runScripts: "outside-only" });
  dom.window.CURRICULO = { nome: "Ana Souza", cidade: "São Paulo", email: "ana@exemplo.com" };
  dom.window.eval(codigo("content/mapeamento.js"));
  const total = dom.window.eval(codigo("content/preencher.js"));
  const v = (id) => dom.window.document.getElementById(id);
  assert.strictEqual(total, 2); // só nome e cidade
  assert.strictEqual(v("a").value, ""); // antes recebia o nome da candidata
  assert.strictEqual(v("b").value, ""); // antes recebia a cidade atual
  assert.strictEqual(v("c").value, "");
  assert.strictEqual(v("d").value, "Ana Souza");
  assert.strictEqual(v("e").value, "São Paulo");
  assert.strictEqual(v("g").checked, false);
  assert.strictEqual(v("h").checked, false);
  assert.strictEqual(v("i").files.length, 0);
});
