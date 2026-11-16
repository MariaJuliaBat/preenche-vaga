// Declara as variáveis globais criadas pelos scripts da extensão,
// para o TypeScript saber que elas existem quando checa os outros arquivos.
interface ItemMapeamento {
  campo: string;
  palavras: string[];
}

declare var MAPEAMENTO_CAMPOS: ItemMapeamento[];

// Currículo injetado pelo popup antes de rodar content/preencher.js.
declare var CURRICULO: Record<string, string> | undefined;

// Currículo completo, como lido do .docx por popup/importar-docx.js.
interface CurriculoCompleto {
  nome: string;
  email: string;
  telefone: string;
  cidade: string;
  estado: string;
  linkedin: string;
  github: string;
  objetivo: string;
  resumo: string;
  educacao: { curso: string; instituicao: string; periodo: string; detalhes: string[] }[];
  experiencias: { cargo: string; empresa: string; inicio: string; fim: string; atual: boolean; descricao: string }[];
  projetos: { nome: string; descricao: string }[];
  habilidades: string[];
  idiomas: { idioma: string; nivel: string }[];
  cursos: string[];
}

declare var ImportarDocx: {
  importar(buffer: ArrayBuffer): Promise<{ completo: CurriculoCompleto; campos: Record<string, string> }>;
  lerDocx(buffer: ArrayBuffer): Promise<{ paragrafos: string[]; links: { texto: string; url: string }[] }>;
  interpretar(paragrafos: string[], links?: { texto: string; url: string }[]): CurriculoCompleto;
  paraCampos(completo: CurriculoCompleto): Record<string, string>;
};
