#!/usr/bin/env node
// Uso: node src/cli.js "O que já fiz com automação?"   (a GEMINI_API_KEY vem do .env da raiz do projeto)
const path = require("node:path");
const { lerArquivoEnv } = require("../../pipeline/config");
const { criarAgenteAdk, perguntar } = require("./agente");

async function main() {
  const env = { ...lerArquivoEnv(path.join(__dirname, "..", "..", ".env")), ...process.env };
  const pergunta = process.argv.slice(2).join(" ").trim();
  if (!pergunta) { console.error('Uso: node src/cli.js "sua pergunta"'); process.exit(2); }
  if (!env.GEMINI_API_KEY) { console.error("GEMINI_API_KEY ausente: coloque a chave no .env da raiz."); process.exit(2); }
  process.env.GEMINI_API_KEY = env.GEMINI_API_KEY; // o ADK lê a chave do ambiente
  const { ferramentas, resposta } = await perguntar(criarAgenteAdk({ env }), pergunta);
  console.log(`Ferramentas acionadas: ${ferramentas.join(", ") || "nenhuma"}\n\n${resposta}`);
}

main().catch((erro) => { console.error(erro instanceof Error ? erro.message : erro); process.exit(1); });
