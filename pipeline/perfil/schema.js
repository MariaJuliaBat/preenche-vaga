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
    status: texto,
    previsaoConclusao: texto
  })),
  experiencias: z.array(z.object({
    tipo: z.enum(["experiencia", "projeto"]),
    titulo: texto,
    organizacao: texto,
    periodo: texto,
    descricao: z.array(z.string()),
    tecnologias: z.array(z.string())
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
