// A ordem importa: o primeiro Dado do Currículo que casa com a Pista vence.
// Por isso os Sinônimos mais específicos ("cidade de nascimento", "nome da mãe", "empresa"...) vêm antes dos genéricos
// ("cidade", "nome"). Usado pela extensão (só preenche as chaves que o popup cadastra) e pelo pipeline/apply/
// (Perfil + Dados Complementares). Entradas marcadas "sem dado" só existem para o campo não receber o valor errado.
globalThis.MAPEAMENTO_CAMPOS = [
  // Dados Complementares e campos pessoais que o Currículo não tem (a extensão ignora: o popup não cadastra estas chaves).
  { campo: "cidadeNascimento", palavras: ["cidade de nascimento", "naturalidade", "local de nascimento"] }, // sem dado
  { campo: "estadoNascimento", palavras: ["estado de nascimento", "uf de nascimento"] }, // sem dado
  { campo: "nomeMae", palavras: ["nome da mae", "filiacao", "mother"] }, // sem dado
  { campo: "nomePai", palavras: ["nome do pai", "father"] }, // sem dado
  { campo: "estadoCivil", palavras: ["estado civil", "marital"] }, // sem dado
  { campo: "dataNascimento", palavras: ["data de nascimento", "nascimento", "birth", "aniversario"] },
  { campo: "cpf", palavras: ["cpf"] },
  { campo: "genero", palavras: ["genero", "sexo", "gender"] },
  { campo: "autodeclaracao", palavras: ["autodeclaracao", "cor ou raca", "raca", "etnia"] },
  { campo: "pretensaoSalarial", palavras: ["pretensao salarial", "pretensao", "remuneracao", "salario", "salary"] },
  { campo: "disponibilidadeInicio", palavras: ["disponibilidade para iniciar", "disponibilidade", "inicio imediato", "data de inicio", "start date"] },
  { campo: "horarioDisponivel", palavras: ["horario de preferencia", "horario", "turno"] },
  { campo: "modalidadePreferida", palavras: ["modalidade", "regime de trabalho", "tipo de trabalho", "work model"] },
  // Currículo.
  {
    campo: "empresa",
    palavras: ["empresa atual", "ultima empresa", "empresa", "employer", "company"]
  },
  {
    campo: "cargo",
    palavras: ["cargo atual", "ultimo cargo", "cargo", "ocupacao", "job title"]
  },
  {
    campo: "instituicao",
    palavras: ["instituicao de ensino", "instituicao", "faculdade", "universidade"]
  },
  {
    campo: "curso",
    palavras: ["curso", "formacao", "graduacao", "area de estudo"]
  },
  {
    campo: "objetivo",
    palavras: ["objetivo"]
  },
  {
    campo: "resumo",
    palavras: ["resumo", "sobre voce", "sobre mim", "apresentacao", "summary", "about you"]
  },
  {
    campo: "habilidades",
    palavras: ["habilidades", "competencias", "skills"]
  },
  {
    campo: "idiomas",
    palavras: ["idiomas", "idioma", "languages"]
  },
  {
    campo: "nome",
    palavras: ["nome", "name", "full name"]
  },
  {
    campo: "email",
    palavras: ["email", "e-mail", "correio eletronico"]
  },
  {
    campo: "telefone",
    palavras: ["telefone", "celular", "phone", "mobile"]
  },
  {
    campo: "linkedin",
    palavras: ["linkedin", "perfil profissional"]
  },
  {
    campo: "portfolio",
    palavras: ["portfolio", "github", "site pessoal"]
  },
  {
    campo: "estado",
    palavras: ["estado", "unidade federativa", "state"]
  },
  {
    campo: "cidade",
    palavras: ["cidade", "city", "localidade"]
  }
];

// Sinônimos de VALOR (P25): "Feminino" ≡ "Mulher". Cada grupo é uma lista de formas equivalentes, já sem acento e em minúsculas.
globalThis.MAPEAMENTO_VALORES = [
  ["feminino", "mulher", "female", "mulher cis", "mulher cisgenero"],
  ["masculino", "homem", "male", "homem cis", "homem cisgenero"],
  ["remoto", "home office", "teletrabalho", "remote", "100 remoto"],
  ["hibrido", "hybrid", "semipresencial"],
  ["presencial", "on site", "onsite"],
  ["integral", "tempo integral", "full time"],
  ["meio periodo", "part time", "meio expediente"],
  ["imediata", "imediato", "inicio imediato", "assim que possivel", "imediatamente"],
  ["sim", "yes", "s"],
  ["nao", "no", "n"]
];

// Textos de Aceite (P26): checkbox de termos, privacidade/LGPD ou declaração de veracidade. O pipeline NUNCA marca estes.
globalThis.MAPEAMENTO_ACEITES = [
  "aceito", "aceite", "concordo", "termos de uso", "termos e condicoes", "termos", "politica de privacidade",
  "privacidade", "lgpd", "protecao de dados", "declaro", "veracidade", "consinto", "consentimento", "autorizo", "estou ciente"
];
