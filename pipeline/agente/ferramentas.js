// Tool Calling (A2, A4, A10, A12): as 3 ferramentas reais do projeto. TODAS só leem; nenhuma envia, preenche ou escreve.
const { z } = require("zod");
const { normalizar } = require("../radar/texto");
const { palavrasChave } = require("../curriculo/conteudo");
const { perfilSeguro } = require("./fontes");
const { blocoDeDados } = require("./prompt");

const MAX_TEXTO_DA_VAGA = 3000;

const ArgsBase = z.object({ consulta: z.string().trim().min(1).max(500), topK: z.number().int().min(1).max(5).optional() });
const ArgsVagas = z.object({ filtro: z.string().max(200).optional(), limite: z.number().int().min(1).max(10).optional() });
const ArgsAnalise = z.object({ vaga: z.string().trim().min(1).max(500) });

/** Declarações no formato do Gemini (functionDeclarations). */
const DECLARACOES = Object.freeze([
  {
    name: "consultar_base_pessoal",
    description: "Busca na Base de Conhecimento da Candidata (projetos, estudos, respostas prontas) os trechos mais parecidos com a consulta. Use antes de afirmar qualquer experiência.",
    parameters: { type: "OBJECT", properties: { consulta: { type: "STRING", description: "O que procurar, em linguagem natural." }, topK: { type: "INTEGER", description: "Quantos trechos (1 a 5; padrão 3)." } }, required: ["consulta"] }
  },
  {
    name: "consultar_vagas_planilha",
    description: "Lista as vagas já salvas pelo Radar (Lote Final): título, empresa, link, se é de Brasília - DF e pontuação.",
    parameters: { type: "OBJECT", properties: { filtro: { type: "STRING", description: "Texto para filtrar por título ou empresa." }, limite: { type: "INTEGER", description: "Máximo de vagas (1 a 10; padrão 5)." } } }
  },
  {
    name: "analisar_vaga_e_curriculo",
    description: "Compara os requisitos de UMA vaga salva com o Perfil: tecnologias que casam e lacunas. Devolve também o texto da vaga (dado não confiável).",
    parameters: { type: "OBJECT", properties: { vaga: { type: "STRING", description: "Link da vaga ou parte do título." } }, required: ["vaga"] }
  }
]);

/** @param {{ titulo?: string, url?: string }} v @param {string} busca */
const combina = (v, busca) => {
  const b = normalizar(busca);
  return normalizar(v.url) === b || normalizar(v.titulo).includes(b);
};

/**
 * @param {{
 *   rag: { buscar: (consulta: string, opcoes?: { topK?: number }) => Promise<{ score: number, fonte: string, secao: string, texto: string }[]> },
 *   lerVagas: () => any[],
 *   lerPerfil: () => any
 * }} deps
 */
function criarFerramentas({ rag, lerVagas, lerPerfil }) {
  /** @type {Record<string, { args: z.ZodType<any>, rodar: (args: any) => Promise<{ resultado: any, fontes?: string[] }> }>} */
  const tabela = {
    consultar_base_pessoal: {
      args: ArgsBase,
      async rodar({ consulta, topK = 3 }) {
        const trechos = await rag.buscar(consulta, { topK });
        return { resultado: { trechos }, fontes: trechos.map((t) => t.texto) };
      }
    },
    consultar_vagas_planilha: {
      args: ArgsVagas,
      async rodar({ filtro, limite = 5 }) {
        const todas = lerVagas();
        const achadas = filtro ? todas.filter((v) => combina({ titulo: `${v.titulo} ${v.empresa}` }, filtro)) : todas;
        return {
          resultado: {
            total: achadas.length,
            vagas: achadas.slice(0, limite).map((v) => ({ titulo: String(v.titulo || ""), empresa: String(v.empresa || ""), url: String(v.url || ""), ehVagaDF: Boolean(v.ehVagaDF), pontos: Number(v.pontos) || 0 }))
          }
        };
      }
    },
    analisar_vaga_e_curriculo: {
      args: ArgsAnalise,
      async rodar({ vaga }) {
        const perfil = lerPerfil();
        if (!perfil) return { resultado: { erro: "Perfil não encontrado em output/perfil.json. Rode o gerador de currículo para criá-lo." } };
        const achada = lerVagas().find((v) => combina(v, vaga));
        if (!achada) return { resultado: { erro: "Vaga não encontrada no Lote Final. Use consultar_vagas_planilha para ver as disponíveis." } };
        const seguro = perfilSeguro(perfil);
        const { casadas, lacunas } = palavrasChave(perfil, `${achada.titulo}\n${achada.descricao || ""}`);
        return {
          resultado: {
            vaga: { titulo: String(achada.titulo || ""), empresa: String(achada.empresa || ""), url: String(achada.url || "") },
            tecnologiasQueCasam: casadas,
            lacunas,
            textoDaVaga: blocoDeDados("descrição da vaga", String(achada.descricao || "").slice(0, MAX_TEXTO_DA_VAGA)),
            perfil: seguro
          },
          fontes: [JSON.stringify(seguro), ...casadas] // só fatos da Candidata servem de evidência; o texto da vaga não
        };
      }
    }
  };

  return {
    declaracoes: DECLARACOES,
    /**
     * A4: nome inválido ou argumento inválido viram resultado `{ erro }` para o modelo, nunca exceção.
     * @param {string} nome @param {unknown} args
     * @returns {Promise<{ ok: boolean, resultado: any, fontes: string[] }>}
     */
    async executar(nome, args) {
      const f = Object.hasOwn(tabela, nome) ? tabela[nome] : null;
      if (!f) return { ok: false, resultado: { erro: `Ferramenta desconhecida: ${nome}.` }, fontes: [] };
      const validado = f.args.safeParse(args ?? {});
      if (!validado.success) return { ok: false, resultado: { erro: `Argumentos inválidos: ${validado.error.issues[0]?.message || "formato"}.` }, fontes: [] };
      try {
        const r = await f.rodar(validado.data);
        return { ok: !r.resultado?.erro, resultado: r.resultado, fontes: r.fontes || [] };
      } catch (erro) {
        return { ok: false, resultado: { erro: erro instanceof Error ? erro.message : "Falha na ferramenta." }, fontes: [] };
      }
    }
  };
}

module.exports = { criarFerramentas, DECLARACOES };
