// Dados Complementares (P22): CPF, nascimento, gênero etc., lidos de secrets/dados-complementares.json (fora do Git).
// Nunca vão ao LLM nem a logs ou planilha (P23, A23). Sem o arquivo, nada é inventado: campos que dependem deles ficam vazios.
const fs = require("node:fs");
const { z } = require("zod");

const texto = z.string().trim().min(1).optional();

const ComplementaresSchema = z.object({
  cpf: z.string().regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, "CPF no formato 000.000.000-00").optional(),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD").optional(),
  genero: texto,
  autodeclaracao: texto,
  disponibilidadeInicio: texto,
  horarioDisponivel: texto,
  modalidadePreferida: texto,
  pretensaoSalarial: texto
}).strict();

/**
 * @param {string} caminho
 * @returns {{ dados: z.infer<typeof ComplementaresSchema>, existe: boolean }}
 */
function lerComplementares(caminho) {
  if (!fs.existsSync(caminho)) return { dados: {}, existe: false };
  let bruto;
  try {
    bruto = JSON.parse(fs.readFileSync(caminho, "utf8"));
  } catch {
    throw new Error("dados-complementares.json não é um JSON válido.");
  }
  const analise = ComplementaresSchema.safeParse(bruto);
  // A mensagem cita só o NOME do campo inválido, nunca o valor (P23).
  if (!analise.success) throw new Error(`dados-complementares.json inválido: ${analise.error.issues.map((i) => `${i.path.join(".") || "(raiz)"} (${i.message})`).join("; ")}`);
  return { dados: analise.data, existe: true };
}

module.exports = { ComplementaresSchema, lerComplementares };
