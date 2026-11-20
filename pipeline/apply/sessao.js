// Sessão persistente (A1 a A6): perfil do navegador em output/sessao-navegador/, para o login feito uma vez valer nas
// execuções automáticas. O Pipeline abre a janela; a Candidata faz o login. Senha nunca passa por aqui (A2).
const fs = require("node:fs");

/** Portais com login assistido e domínio permitido na candidatura. LinkedIn fica de fora (risco para a conta). O Trampos saiu da lista padrão. */
const PORTAIS = Object.freeze({
  gupy: { nome: "Gupy", dominios: ["gupy.io"], login: "https://login.gupy.io/candidates/signin" },
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
 * Abre o Chrome ou o Edge com a Sessão. PDF_BROWSER_PATH tem prioridade (como no gerador de PDF).
 * @param {{ pasta: string, visivel: boolean, env?: Record<string, string | undefined> }} opcoes
 */
async function abrirContextoPersistente({ pasta, visivel, env = process.env }) {
  const { chromium } = require("playwright-core");
  fs.mkdirSync(pasta, { recursive: true });
  const base = { headless: !visivel, viewport: visivel ? null : { width: 1280, height: 900 }, acceptDownloads: false };
  /** @type {Record<string, any>[]} */
  const tentativas = env.PDF_BROWSER_PATH ? [{ executablePath: env.PDF_BROWSER_PATH }] : [{ channel: "chrome" }, { channel: "msedge" }];
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
  throw new Error(`Não achei Chrome nem Edge (defina PDF_BROWSER_PATH). ${ultimo instanceof Error ? ultimo.message.split("\n")[0] : ""}`);
}

/**
 * Login Assistido (A1): janela visível; a Candidata entra à mão e fecha a janela.
 * @param {{ config: any, portal?: string | null, saida?: (t: string) => void, abrir?: (o: { pasta: string, visivel: boolean }) => Promise<any> }} args
 */
async function loginAssistido({ config, portal = null, saida = console.log, abrir = abrirContextoPersistente }) {
  if (portal && !portalConhecido(portal)) {
    throw new Error(`Portal desconhecido "${portal}". Use ${Object.keys(PORTAIS).join(" ou ")}, ou --login sem argumento para uma janela em branco.`);
  }
  const alvo = portal ? PORTAIS[/** @type {keyof typeof PORTAIS} */ (portal)] : null;
  const contexto = await abrir({ pasta: config.pastas.sessaoNavegador, visivel: true });
  const fechou = new Promise((resolve) => contexto.on("close", resolve));
  const pagina = contexto.pages()[0] || await contexto.newPage();
  if (alvo) await pagina.goto(alvo.login).catch(() => {});
  saida(`Janela aberta${alvo ? ` em ${alvo.nome}` : ""}. Entre na sua conta e FECHE a janela quando terminar: o login fica salvo em ${config.pastas.sessaoNavegador}.`);
  await fechou;
  saida("Sessão salva.");
}

module.exports = { PORTAIS, portalConhecido, portalDaUrl, abrirContextoPersistente, loginAssistido };
