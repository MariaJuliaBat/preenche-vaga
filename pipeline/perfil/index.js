// Perfil extraído do Currículo Base (P18 a P21), 100% determinístico: sem LLM, sem chave, sem custo.
// O parser lê títulos de seção, listas, períodos e contatos; o schema Zod valida; todo valor é um trecho do próprio Doc.
const fs = require("node:fs");
const path = require("node:path");
const { PerfilSchema } = require("./schema");
const { parsearPerfil } = require("./parser");

const MINIMO_DE_TEXTO = 40;

/**
 * @param {string} texto Texto do Currículo Base
 */
function extrairPerfil(texto) {
  if (!texto || texto.trim().length < MINIMO_DE_TEXTO) {
    throw new Error("O Currículo Base está vazio ou curto demais para extrair o Perfil.");
  }
  const { perfil, avisos } = parsearPerfil(texto);
  const validado = PerfilSchema.safeParse(perfil);
  if (!validado.success) throw new Error(`O Perfil extraído não passou no schema: ${validado.error.issues[0]?.message || "formato inválido"}.`);
  return { perfil: validado.data, avisos };
}

/**
 * Lê o Doc e extrai o Perfil. Grava output/perfil.json (ignorado pelo Git) só para você conferir o que foi lido.
 * @param {{ lerTexto: () => Promise<string>, pastaSaida: string }} args
 */
async function obterPerfil({ lerTexto, pastaSaida }) {
  const texto = await lerTexto();
  const { perfil, avisos } = extrairPerfil(texto);
  fs.mkdirSync(pastaSaida, { recursive: true });
  fs.writeFileSync(path.join(pastaSaida, "perfil.json"), JSON.stringify({ geradoEm: new Date().toISOString(), perfil, avisos }, null, 2), "utf8");
  return { perfil, avisos };
}

/**
 * O que o Radar usa do Perfil (PF7): habilidades e grau da formação.
 * @param {ReturnType<typeof extrairPerfil>["perfil"]} perfil
 * @returns {import("../radar/tipos").Perfil}
 */
function perfilParaRadar(perfil) {
  const habilidades = [...perfil.habilidades.tecnicas, ...perfil.habilidades.ferramentas];
  for (const e of perfil.experiencias) habilidades.push(...e.tecnologias);
  const emAndamento = perfil.formacao.find((f) => /andamento|cursando|em curso/i.test(f.status || "")) || perfil.formacao[0];
  return { habilidades: [...new Set(habilidades)], formacao: emAndamento ? { grau: emAndamento.grau } : null };
}

module.exports = { extrairPerfil, obterPerfil, perfilParaRadar };
