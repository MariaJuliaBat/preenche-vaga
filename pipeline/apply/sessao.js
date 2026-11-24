// Sessão persistente (A1 a A6): perfil do navegador em output/sessao-navegador/, para o login feito uma vez valer nas
// execuções automáticas. O Pipeline abre a janela; a Candidata faz o login. Senha nunca passa por aqui (A2).
const fs = require("node:fs");
const path = require("node:path");

/** Portais com login assistido e domínio permitido na candidatura. LinkedIn fica de fora (risco para a conta). O Trampos saiu da lista padrão. */
const PORTAIS = Object.freeze({
  gupy: { nome: "Gupy", dominios: ["gupy.io"], login: "https://portal.gupy.io" },
  indeed: { nome: "Indeed", dominios: ["indeed.com"], login: "https://secure.indeed.com/auth" },
  infojobs: { nome: "InfoJobs", dominios: ["infojobs.com.br"], login: "https://login.infojobs.com.br/Candidate" }
});

/** @param {string} portal */
const portalConhecido = (portal) => Object.hasOwn(PORTAIS, portal);

/**
 * Portal dono do endereço (ou null: formulário web padrão).
 * @param {string} url
 */
function portalDaUrl(url) {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const achado = Object.entries(PORTAIS).find(([, p]) => p.dominios.some((d) => host === d || host.endsWith(`.${d}`)));
  return achado ? achado[0] : null;
}

const JA_ABERTO = /ProcessSingleton|already in use|SingletonLock|profile.*(in use|locked)|Target page, context or browser has been closed/i; // o último: o Chrome entrega ao processo que já usa o perfil e sai
const SEM_NAVEGADOR = /Executable doesn't exist|not found|is not installed|distribution/i;

/**
 * Brave nos caminhos padrão do Windows, se estiver instalado.
 * @param {Record<string, string | undefined>} env @param {(caminho: string) => boolean} existe @param {string} plataforma
 */
function acharBrave(env = process.env, existe = fs.existsSync, plataforma = process.platform) {
  if (plataforma !== "win32") return null;
  const candidatos = [
    path.win32.join(env.ProgramFiles || "C:\\Program Files", "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
  ].filter(Boolean);
  return /** @type {string[]} */ (candidatos).find((c) => existe(c)) || null;
}

/**
 * Abre o navegador REAL do sistema com a Sessão (o Chromium de teste é bloqueado pelo login da Gupy).
 * Ordem: BROWSER_EXECUTABLE_PATH (ou PDF_BROWSER_PATH) → Brave instalado → Edge → Chrome.
 * Sem --no-sandbox e sem --enable-automation.
 * @param {{ pasta: string, visivel: boolean, executavel?: string, env?: Record<string, string | undefined>, chromium?: any, existe?: (caminho: string) => boolean, plataforma?: string }} opcoes
 */
async function abrirContextoPersistente({ pasta, visivel, executavel, env = process.env, chromium = require("playwright-core").chromium, existe = fs.existsSync, plataforma = process.platform }) {
  fs.mkdirSync(pasta, { recursive: true });
  const base = { headless: !visivel, viewport: visivel ? null : { width: 1280, height: 900 }, acceptDownloads: false, ignoreDefaultArgs: ["--enable-automation"] };
  /** @type {Record<string, any>[]} */
  const escolhido = executavel || env.BROWSER_EXECUTABLE_PATH || env.PDF_BROWSER_PATH; // executavel vem do .env (config); process.env é o plano B
  const brave = escolhido ? null : acharBrave(env, existe, plataforma);
  const tentativas = escolhido
    ? [{ executablePath: escolhido }]
    : [...(brave ? [{ executablePath: brave }] : []), { channel: "msedge" }, { channel: "chrome" }];
  /** @type {unknown} */
  let ultimo = null;
  for (const t of tentativas) {
    try {
      return await chromium.launchPersistentContext(pasta, { ...base, ...t });
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      if (JA_ABERTO.test(msg)) throw new Error("A Sessão já está aberta em outra janela: feche a janela de login (ou o outro navegador do Pipeline) e tente de novo.");
      if (!SEM_NAVEGADOR.test(msg)) throw erro;
      ultimo = erro;
    }
  }
  throw new Error(`Não achei Brave, Edge nem Chrome (defina BROWSER_EXECUTABLE_PATH no .env com o caminho do executável). ${ultimo instanceof Error ? ultimo.message.split("\n")[0] : ""}`);
}

/**
 * Login Assistido (A1): janela visível; a Candidata entra à mão e fecha a janela.
 * @param {{ config: any, portal?: string | null, saida?: (t: string) => void, abrir?: (o: { pasta: string, visivel: boolean, executavel?: string }) => Promise<any> }} args
 */
async function loginAssistido({ config, portal = null, saida = console.log, abrir = abrirContextoPersistente }) {
  if (portal && !portalConhecido(portal)) {
    throw new Error(`Portal desconhecido "${portal}". Use ${Object.keys(PORTAIS).join(" ou ")}, ou --login sem argumento para uma janela em branco.`);
  }
  const alvo = portal ? PORTAIS[/** @type {keyof typeof PORTAIS} */ (portal)] : null;
  const executavel = config.navegador?.executavel;
  const contexto = await abrir({ pasta: config.pastas.sessaoNavegador, visivel: true, ...(executavel ? { executavel } : {}) });
  const fechou = new Promise((resolve) => contexto.on("close", resolve));
  const pagina = contexto.pages()[0] || await contexto.newPage();
  if (alvo) await pagina.goto(alvo.login).catch(() => {});
  saida(`Janela aberta${alvo ? ` em ${alvo.nome}` : ""}. Entre na sua conta e FECHE a janela quando terminar: o login fica salvo em ${config.pastas.sessaoNavegador}.`);
  await fechou;
  saida("Sessão salva.");
}

module.exports = { PORTAIS, portalConhecido, portalDaUrl, acharBrave, abrirContextoPersistente, loginAssistido };
