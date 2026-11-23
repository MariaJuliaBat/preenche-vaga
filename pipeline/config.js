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
  curriculo: ["GOOGLE_DOC_CV_BASE_URL", "GOOGLE_SERVICE_ACCOUNT_FILE"],
  candidatura: ["GOOGLE_SHEET_URL", "GOOGLE_DOC_CV_BASE_URL", "GOOGLE_SERVICE_ACCOUNT_FILE"]
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
 * Inteiro positivo do .env (RD23). Vazio usa o padrão; qualquer outra coisa que não seja inteiro positivo é erro.
 * @param {string | undefined} valor
 * @param {string} nome
 * @param {number} padrao
 */
function lerInteiroPositivo(valor, nome, padrao) {
  if (valor === undefined || valor === "") return padrao;
  if (!/^[1-9][0-9]*$/.test(valor.trim())) throw new Error(`${nome} deve ser um número inteiro maior que zero (recebi "${valor}").`);
  return Number.parseInt(valor.trim(), 10);
}

/** Fontes do Radar, na ordem de busca. As com busca focada em Brasília - DF vêm antes do GitHub. */
const FONTES_DO_RADAR = Object.freeze(["gupy", "solides", "infojobs", "linkedin", "indeed", "github"]);

/**
 * RADAR_FONTES: lista de fontes separadas por vírgula; vazio usa todas. Fonte desconhecida é erro (nada de adivinhar).
 * @param {string | undefined} valor
 */
function lerFontes(valor) {
  const pedidas = String(valor || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (pedidas.length === 0) return [...FONTES_DO_RADAR];
  const desconhecida = pedidas.find((f) => !FONTES_DO_RADAR.includes(f));
  if (desconhecida) throw new Error(`RADAR_FONTES tem uma fonte desconhecida ("${desconhecida}"). Use: ${FONTES_DO_RADAR.join(", ")}.`);
  return [...new Set(pedidas)];
}

/** @param {string | undefined} valor */
const lerLista = (valor) => String(valor || "").split(",").map((x) => x.trim()).filter(Boolean);

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
    dadosComplementares: path.resolve(RAIZ, env.DADOS_COMPLEMENTARES_FILE || "secrets/dados-complementares.json"),
    planilha: PLANILHA,
    // Auto-Apply: janela visível por padrão (a aba com Pendência fica aberta para você terminar). APPLY_HEADLESS=true esconde a janela.
    apply: { headless: env.APPLY_HEADLESS === "true" },
    radar: {
      vigenciaDias: lerInteiroPositivo(env.RADAR_VIGENCIA_DIAS, "RADAR_VIGENCIA_DIAS", 20),
      maxVagasLote: lerInteiroPositivo(env.MAX_VAGAS_LOTE, "MAX_VAGAS_LOTE", 10),
      fontes: lerFontes(env.RADAR_FONTES),
      reposGithub: env.RADAR_REPOS_GITHUB !== undefined && env.RADAR_REPOS_GITHUB !== ""
        ? lerLista(env.RADAR_REPOS_GITHUB)
        : ["frontendbr/vagas", "backend-br/vagas"],
      githubToken: env.GITHUB_TOKEN || "",
      // Provisório até o Perfil (P18) existir: a stack vem do .env, que fica fora do Git.
      stack: lerLista(env.RADAR_STACK)
    },
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
