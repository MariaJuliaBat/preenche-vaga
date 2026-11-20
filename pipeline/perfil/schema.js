// Schema do Perfil (PF4). Campo ausente é null; lista ausente é []. Nunca preenchido por suposição.
const { z } = require("zod");

const texto = z.string().nullable();

const PerfilSchema = z.object({
  identificacao: z.object({
    nome: texto,
    email: texto,
    telefone: texto,
    cidade: texto,
    estado: texto,
    regiaoAdministrativa: texto,
    linkedin: texto,
    github: texto,
    portfolio: texto
  }),
  formacao: z.array(z.object({
    instituicao: texto,
    curso: texto,
    grau: texto,
    sigla: texto.default(null),
    status: texto,
    previsaoConclusao: texto
  })),
  experiencias: z.array(z.object({
    tipo: z.enum(["experiencia", "projeto"]),
    titulo: texto,
    organizacao: texto,
    periodo: texto,
    descricao: z.array(z.string()),
    tecnologias: z.array(z.string()),
    // Links do item ("Repositório: github.com/...", "Notícia: ..."), com a URL exata do Doc.
    links: z.array(z.object({ rotulo: z.string(), url: z.string() })).default([])
  })),
  habilidades: z.object({
    tecnicas: z.array(z.string()),
    ferramentas: z.array(z.string()),
    idiomas: z.array(z.string())
  })
});

/** Mudou o schema? Aumente: o Cache do Perfil antigo deixa de valer. */
const VERSAO_PERFIL = 1;

module.exports = { PerfilSchema, VERSAO_PERFIL };
