// Structured Output (A6, A7) e Ancoragem (A9): a Análise de Aderência vem em JSON validado por Zod,
// e cada ponto forte só fica se a evidência existir de fato na Base ou no Perfil.
const { z } = require("zod");
const { normalizar } = require("../radar/texto");

const AnaliseSchema = z.object({
  score: z.number().int().min(0).max(100),
  resumo: z.string().min(1),
  pontosFortes: z.array(z.object({ ponto: z.string().min(1), evidencia: z.string().min(1) })),
  lacunas: z.array(z.string()),
  rascunhoResposta: z.object({ pergunta: z.string(), resposta: z.string() }).nullable()
});

/** O mesmo contrato no formato `responseSchema` do Gemini. */
const RESPONSE_SCHEMA = Object.freeze({
  type: "OBJECT",
  properties: {
    score: { type: "INTEGER", description: "Aderência de 0 a 100." },
    resumo: { type: "STRING", description: "Uma ou duas frases." },
    pontosFortes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { ponto: { type: "STRING" }, evidencia: { type: "STRING", description: "Trecho copiado LITERALMENTE da Base ou do Perfil." } },
        required: ["ponto", "evidencia"]
      }
    },
    lacunas: { type: "ARRAY", items: { type: "STRING" }, description: "O que a vaga pede e a Candidata não tem." },
    rascunhoResposta: {
      type: "OBJECT",
      nullable: true,
      description: "Rascunho para pergunta aberta de formulário; null se não houver pergunta.",
      properties: { pergunta: { type: "STRING" }, resposta: { type: "STRING" } },
      required: ["pergunta", "resposta"]
    }
  },
  required: ["score", "resumo", "pontosFortes", "lacunas", "rascunhoResposta"]
});

/** Minúsculas, sem acento, espaços colapsados. @param {string} s */
const base = (s) => normalizar(s).replace(/\s+/g, " ").trim();

/**
 * A9. Remove pontos fortes cuja evidência não aparece nas fontes (fatos da Candidata) e explica em `avisos`.
 * @param {z.infer<typeof AnaliseSchema>} analise
 * @param {string[]} fontes
 */
function ancorarAnalise(analise, fontes) {
  const texto = base(fontes.join("\n"));
  /** @type {string[]} */
  const avisos = [];
  const pontosFortes = analise.pontosFortes.filter((p) => {
    const ok = base(p.evidencia).length >= 3 && texto.includes(base(p.evidencia));
    if (!ok) avisos.push(`Ponto forte removido por falta de evidência na Base ou no Perfil: "${p.ponto}".`);
    return ok;
  });
  return { analise: { ...analise, pontosFortes }, avisos };
}

/**
 * Pede a análise ao modelo com responseSchema, valida com Zod e tenta mais uma vez se vier inválida (A7).
 * @param {{ gerar: (p: any) => Promise<string> }} cliente
 * @param {{ systemInstruction: string, contents: any[] }} pedido
 */
async function pedirAnalise(cliente, pedido) {
  let motivo = "";
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const texto = await cliente.gerar({ ...pedido, responseSchema: RESPONSE_SCHEMA });
    try {
      const validado = AnaliseSchema.safeParse(JSON.parse(texto));
      if (validado.success) return validado.data;
      motivo = validado.error.issues[0]?.message || "formato inválido";
    } catch {
      motivo = "JSON inválido";
    }
  }
  throw new Error(`O modelo não devolveu uma análise válida (${motivo}).`);
}

module.exports = { AnaliseSchema, RESPONSE_SCHEMA, ancorarAnalise, pedirAnalise };
