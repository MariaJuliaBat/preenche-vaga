// Currículos FICTÍCIOS para os testes do parser de Perfil e do gerador. Nenhum dado real.

/** Formato A: títulos em maiúsculas, tópicos com hífen, tudo em uma linha por item. */
const TEXTO_A = `Maria Exemplo
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

/** Formato B: títulos com acento e dois-pontos, cabeçalho de item em duas linhas, marcadores •, rótulos nas habilidades. */
const TEXTO_B = `MARIA EXEMPLO
Brasília, DF • maria.exemplo@exemplo.com • +55 61 98888-7777
https://www.linkedin.com/in/maria-exemplo | GitHub (https://github.com/mariaexemplo) | Portfólio (https://maria.exemplo.dev)

Formação Acadêmica:
Universidade Exemplo
Licenciatura em Computação
Previsão de conclusão: dez/2029

Experiência Profissional
Desenvolvedora Júnior
Acme Exemplo | Jan 2024 – Dez 2024
• Construí APIs com Node.js e Express.
• Escrevi testes com Jest.
Tecnologias: Node.js, Express, Jest

Projetos
Painel de Vagas (2025)
- Interface em React com dados em MySQL.

Habilidades Técnicas
Linguagens: JavaScript, TypeScript, Python
Ferramentas: Git, Docker
Idiomas
Inglês - intermediário; Espanhol - básico
`;

/** Perfil esperado do formato A. */
const PERFIL = {
  identificacao: {
    nome: "Maria Exemplo", email: "maria.exemplo@exemplo.com", telefone: "(61) 99999-0000", cidade: "Brasília", estado: "DF",
    regiaoAdministrativa: null, linkedin: "https://www.linkedin.com/in/maria-exemplo", github: "https://github.com/mariaexemplo", portfolio: null
  },
  formacao: [{ instituicao: "Universidade Exemplo", curso: "Computação", grau: "Licenciatura", sigla: null, status: "cursando", previsaoConclusao: "12/2029" }],
  experiencias: [
    {
      tipo: "experiencia", titulo: "Estagiária de Desenvolvimento", organizacao: "Acme Exemplo", periodo: "2024 - 2025",
      descricao: ["Criei telas em React para o painel interno.", "Automatizei relatórios com Python."], tecnologias: ["React", "Python"], links: []
    },
    {
      tipo: "projeto", titulo: "Gerenciador de Tarefas", organizacao: null, periodo: "2025",
      descricao: ["API REST em Node.js e Express com MySQL."], tecnologias: ["Node.js", "Express", "MySQL"], links: []
    }
  ],
  habilidades: { tecnicas: ["JavaScript", "React", "Node.js", "Express", "Python", "MySQL"], ferramentas: [], idiomas: ["Inglês intermediário"] }
};

const VAGA = {
  titulo: "Desenvolvedora Júnior React", empresa: "Empresa Fictícia", url: "https://vagas.exemplo/p/1",
  descricao: "Buscamos pessoa júnior com React e Node.js para o time de produto. Diferencial: Docker."
};

module.exports = { TEXTO_A, TEXTO_B, TEXTO_DO_CURRICULO: TEXTO_A, PERFIL, VAGA };
