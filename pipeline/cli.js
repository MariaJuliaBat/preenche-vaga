#!/usr/bin/env node
// CLI do Pipeline de Candidatura. Este é o único lugar do projeto com permissão (controlada
// por AUTO_SUBMIT) para enviar candidaturas. A extensão em content/ e popup/ nunca envia.
//
//   npm run pipeline                    completo: radar → currículo → candidatura
//   npm run pipeline -- --only-radar    só o Radar
//   npm run pipeline -- --only-cv       só o gerador de currículo
//   npm run pipeline -- --only-apply    só a candidatura
//   npm run pipeline -- --dry-run       simula: não envia e não escreve na planilha
const { parseArgs } = require("node:util");
const { ETAPAS, lerArquivoEnv, montarConfig, validar } = require("./config");
const logs = require("./logs");
const { resultadoVazio, formatarResumo } = require("./resumo");
const { criarEtapaRadar } = require("./radar/etapa");
const { criarEtapaCurriculo } = require("./curriculo/etapa");

const AJUDA = `Uso: npm run pipeline -- [opções]

  --only-radar   roda só o Radar de Vagas
  --only-cv      roda só o gerador de currículo
  --only-apply   roda só o preenchimento/envio
  --dry-run      simula tudo: não envia candidatura e não escreve na planilha
  -h, --help     mostra esta ajuda

Sem opções de etapa, roda o pipeline completo. Configuração em .env (veja .env.example).
AUTO_SUBMIT=false é o padrão: o pipeline preenche mas não envia.`;

// Cada etapa entra aqui quando for implementada; até lá, só avisa. Contrato: executar(contexto) → void,
// somando em contexto.resultado.
/** @type {Record<string, (contexto: any) => Promise<void>>} */
const IMPLEMENTADAS = { radar: criarEtapaRadar(), curriculo: criarEtapaCurriculo() };

/**
 * @param {string[]} argv
 * @returns {{ etapas: string[], dryRun: boolean, ajuda: boolean }}
 */
function lerArgumentos(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      "only-radar": { type: "boolean" },
      "only-cv": { type: "boolean" },
      "only-apply": { type: "boolean" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" }
    },
    strict: true
  });

  const escolhidas = [];
  if (values["only-radar"]) escolhidas.push("radar");
  if (values["only-cv"]) escolhidas.push("curriculo");
  if (values["only-apply"]) escolhidas.push("candidatura");
  if (escolhidas.length > 1) throw new Error("Use só uma das opções --only-*.");

  return {
    etapas: escolhidas.length === 1 ? escolhidas : [...ETAPAS],
    dryRun: Boolean(values["dry-run"]),
    ajuda: Boolean(values.help)
  };
}

/**
 * @param {string[]} argv
 * @param {{ env?: Record<string, string | undefined>, saida?: (texto: string) => void, etapas?: Record<string, (contexto: any) => Promise<void>> }} [io] `etapas` substitui as etapas reais (testes)
 * @returns {Promise<number>} código de saída
 */
async function executar(argv, io = {}) {
  const saida = io.saida || console.log;
  try {
    const args = lerArgumentos(argv);
    if (args.ajuda) {
      saida(AJUDA);
      return 0;
    }

    // process.env vence o .env, como é o costume.
    const env = io.env || { ...lerArquivoEnv(), ...process.env };
    const config = montarConfig(env, { dryRun: args.dryRun });
    const erros = validar(config, env, args.etapas);
    if (erros.length > 0) {
      saida(erros.join("\n"));
      return 1;
    }

    const resultado = resultadoVazio();
    for (const etapa of args.etapas) {
      const rodar = (io.etapas || IMPLEMENTADAS)[etapa];
      if (!rodar) {
        resultado.etapasNaoImplementadas.push(etapa);
        continue;
      }
      await rodar({ config, resultado, logs });
      resultado.etapasRodadas.push(etapa);
    }

    saida(formatarResumo(resultado, config));
    return 0;
  } catch (erro) {
    saida(`Erro: ${erro instanceof Error ? erro.message : String(erro)}`);
    return 1;
  }
}

if (require.main === module) {
  executar(process.argv.slice(2)).then((codigo) => { process.exitCode = codigo; });
}

module.exports = { executar, lerArgumentos };
