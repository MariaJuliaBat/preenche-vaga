// Currículo e respostas de LLM FICTÍCIOS para os testes do Perfil e do gerador. Nenhum dado real.

const TEXTO_DO_CURRICULO = `Maria Exemplo
maria.exemplo@exemplo.com | (61) 99999-0000 | Brasília - DF
LinkedIn (https://www.linkedin.com/in/maria-exemplo)
github.com/mariaexemplo

FORMAÇÃO
Licenciatura em Computação - Universidade Exemplo - cursando - previsão 12/2029

EXPERIÊNCIA
Estagiária de Desenvolvimento - Acme Exemplo - 2024 - 2025
- Criei telas em React para o painel interno.
- Automatizei relatórios com Python.

PROJETOS
Gerenciador de Tarefas - 2025
- API REST em Node.js e Express com MySQL.

HABILIDADES
JavaScript, React, Node.js, Express, Python, MySQL
Idiomas: Inglês intermediário
`;

/** Resposta do LLM para o Perfil, com duas "invenções" que a Ancoragem precisa pegar. */
const PERFIL_DO_LLM = {
  identificacao: {
    nome: "Maria Exemplo", email: "outra@inventada.com", telefone: null, cidade: "Brasília", estado: "DF",
    regiaoAdministrativa: null, linkedin: null, github: null, portfolio: null
  },
  formacao: [{ instituicao: "Universidade Exemplo", curso: "Computação", grau: "Licenciatura", status: "cursando", previsaoConclusao: "12/2029" }],
  experiencias: [
    {
      tipo: "experiencia", titulo: "Estagiária de Desenvolvimento", organizacao: "Acme Exemplo", periodo: "2024 - 2025",
      descricao: ["Criei telas em React para o painel interno.", "Automatizei relatórios com Python."],
      tecnologias: ["React", "Python", "Kubernetes"]
    },
    {
      tipo: "projeto", titulo: "Gerenciador de Tarefas", organizacao: null, periodo: "2025",
      descricao: ["API REST em Node.js e Express com MySQL."], tecnologias: ["Node.js", "Express", "MySQL"]
    },
    {
      tipo: "experiencia", titulo: "Analista Sênior", organizacao: "Globex Inventada", periodo: "2020 - 2023",
      descricao: ["Liderei um time de dez pessoas."], tecnologias: []
    }
  ],
  habilidades: { tecnicas: ["JavaScript", "React", "Node.js", "Python", "MySQL", "Rust"], ferramentas: ["Express"], idiomas: ["Inglês intermediário"] }
};

/** Perfil já ancorado (o que sobra depois de PERFIL_DO_LLM passar pela Ancoragem). */
const PERFIL = {
  identificacao: {
    nome: "Maria Exemplo", email: "maria.exemplo@exemplo.com", telefone: "(61) 99999-0000", cidade: "Brasília", estado: "DF",
    regiaoAdministrativa: null, linkedin: "https://www.linkedin.com/in/maria-exemplo", github: "https://github.com/mariaexemplo", portfolio: null
  },
  formacao: [{ instituicao: "Universidade Exemplo", curso: "Computação", grau: "Licenciatura", status: "cursando", previsaoConclusao: "12/2029" }],
  experiencias: [
    {
      tipo: "experiencia", titulo: "Estagiária de Desenvolvimento", organizacao: "Acme Exemplo", periodo: "2024 - 2025",
      descricao: ["Criei telas em React para o painel interno.", "Automatizei relatórios com Python."], tecnologias: ["React", "Python"]
    },
    {
      tipo: "projeto", titulo: "Gerenciador de Tarefas", organizacao: null, periodo: "2025",
      descricao: ["API REST em Node.js e Express com MySQL."], tecnologias: ["Node.js", "Express", "MySQL"]
    }
  ],
  habilidades: { tecnicas: ["JavaScript", "React", "Node.js", "Python", "MySQL"], ferramentas: ["Express"], idiomas: ["Inglês intermediário"] }
};

const VAGA = {
  titulo: "Desenvolvedora Júnior React", empresa: "Empresa Fictícia", url: "https://vagas.exemplo/p/1",
  descricao: "Buscamos pessoa júnior com React e Node.js para o time de produto."
};

/** LLM falso: devolve o que o teste mandar, por schema, e conta as chamadas. */
function llmFalso(respostas) {
  const chamadas = [];
  return {
    chamadas,
    modelo: "modelo-falso",
    async json({ sistema, usuario, schema }) {
      chamadas.push({ sistema, usuario, schema });
      const r = respostas.shift();
      if (r instanceof Error) throw r;
      return typeof r === "function" ? r({ sistema, usuario, schema }) : r;
    }
  };
}

module.exports = { TEXTO_DO_CURRICULO, PERFIL_DO_LLM, PERFIL, VAGA, llmFalso };
