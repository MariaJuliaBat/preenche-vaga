// Contexto Pipeline de Candidatura: lê e valida a configuração (.env + flags da CLI).
// Nada aqui faz rede. Só decide *o que* o pipeline pode fazer nesta execução.
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..");

// Contrato com a planilha de controle (aba "Vagas").
const PLANILHA = Object.freeze({
  aba: "Vagas",
  linhaCabecalho: 4,
  primeiraLinhaDeVaga: 5,
  colunaNumero: "A",
  colunaLink: "C"
});

const ETAPAS = Object.freeze(["radar", "curriculo", "candidatura"]);

// Variáveis de ambiente que cada etapa exige. Em --dry-run a planilha ainda é lida
// (para deduplicar), mas nada é escrito.
const EXIGIDAS = Object.freeze({
  radar: ["GOOGLE_SHEET_URL", "GOOGLE_SERVICE_ACCOUNT_FILE"],
  curriculo: ["GOOGLE_DOC_CV_BASE_URL", "GOOGLE_SERVICE_ACCOUNT_FILE", "ANTHROPIC_API_KEY"],
  candidatura: ["GOOGLE_SHEET_URL", "GOOGLE_SERVICE_ACCOUNT_FILE"]
});

/**
 * Carrega o .env para um objeto, sem tocar em process.env.
 * @param {string} [caminho]
 * @returns {Record<string, string>}
 */
function lerArquivoEnv(caminho = path.join(RAIZ, ".env")) {
  if (!fs.existsSync(caminho)) return {};
  const texto = fs.readFileSync(caminho, "utf8");
  /** @type {Record<string, string>} */
  const env = {};
  for (const linha of texto.split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;
    const igual = limpa.indexOf("=");
    if (igual < 1) continue;
    const chave = limpa.slice(0, igual).trim();
    const valor = limpa.slice(igual + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    env[chave] = valor;
  }
  return env;
}

/**
 * AUTO_SUBMIT só vale "true" ou "false". Qualquer outra coisa é erro, não "false" silencioso:
 * quem escreveu "TRUE " ou "sim" quis algo, e adivinhar aqui poderia enviar (ou não) uma candidatura.
 * @param {string | undefined} valor
 */
function lerAutoSubmit(valor) {
  if (valor === undefined || valor === "") return false;
  if (valor === "true") return true;
  if (valor === "false") return false;
  throw new Error(`AUTO_SUBMIT deve ser "true" ou "false" (recebi "${valor}").`);
}

/**
 * Extrai o ID de uma URL do Google Sheets/Docs (…/d/<id>/…).
 * @param {string} url
 */
function extrairIdGoogle(url) {
  const achado = /\/d\/([A-Za-z0-9_-]+)/.exec(url || "");
  if (!achado) throw new Error(`Não achei o ID do documento Google na URL "${url}".`);
  return achado[1];
}

/**
 * @param {Record<string, string | undefined>} env variáveis já mescladas (process.env + .env)
 * @param {{ dryRun?: boolean }} [opcoes]
 */
function montarConfig(env, opcoes = {}) {
  const dryRun = Boolean(opcoes.dryRun);
  const autoSubmit = lerAutoSubmit(env.AUTO_SUBMIT);
  const saida = path.resolve(RAIZ, env.OUTPUT_DIR || "output");

  return {
    dryRun,
    autoSubmit,
    // --dry-run vence AUTO_SUBMIT: simular nunca envia nem escreve na planilha.
    enviarCandidatura: autoSubmit && !dryRun,
    escreverPlanilha: !dryRun,
    googleSheetUrl: env.GOOGLE_SHEET_URL || "",
    googleDocCvBaseUrl: env.GOOGLE_DOC_CV_BASE_URL || "",
    contaDeServico: env.GOOGLE_SERVICE_ACCOUNT_FILE
      ? path.resolve(RAIZ, env.GOOGLE_SERVICE_ACCOUNT_FILE)
      : "",
    anthropicApiKey: env.ANTHROPIC_API_KEY || "",
    dadosComplementares: path.resolve(RAIZ, env.DADOS_COMPLEMENTARES_FILE || "secrets/dados-complementares.json"),
    planilha: PLANILHA,
    pastas: {
      saida,
      curriculos: path.join(saida, "cvs"),
      recibos: path.join(saida, "receipts"),
      logs: path.join(saida, "logs"),
      // Sessão persistente do Playwright (login feito uma vez, reaproveitado depois).
      sessaoNavegador: path.resolve(RAIZ, env.BROWSER_USER_DATA_DIR || path.join(saida, "sessao-navegador"))
    }
  };
}

/**
 * Lista o que falta para rodar as etapas pedidas.
 * @param {ReturnType<typeof montarConfig>} config
 * @param {Record<string, string | undefined>} env
 * @param {string[]} etapas
 * @returns {string[]} mensagens de erro (vazio = pronto)
 */
function validar(config, env, etapas) {
  const faltando = new Set();
  for (const etapa of etapas) {
    for (const nome of EXIGIDAS[/** @type {keyof typeof EXIGIDAS} */ (etapa)] || []) {
      if (!env[nome]) faltando.add(nome);
    }
  }
  const erros = [...faltando].map((nome) => `Falta ${nome} no .env (veja .env.example).`);
  if (config.contaDeServico && !fs.existsSync(config.contaDeServico)) {
    erros.push(`GOOGLE_SERVICE_ACCOUNT_FILE aponta para um arquivo que não existe: ${config.contaDeServico}`);
  }
  return erros;
}

module.exports = { PLANILHA, ETAPAS, lerArquivoEnv, lerAutoSubmit, extrairIdGoogle, montarConfig, validar };
