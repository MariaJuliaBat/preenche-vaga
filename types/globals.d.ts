// Declara a variável global criada por content/mapeamento.js,
// para o TypeScript saber que ela existe quando checa preencher.js.
interface ItemMapeamento {
  campo: string;
  palavras: string[];
}

declare var MAPEAMENTO_CAMPOS: ItemMapeamento[];
