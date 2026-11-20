// Executor do Dashboard (D4 a D6): inicia a CLI do Pipeline, uma Execução por vez, e guarda a saída para a tela.
// Só dispara a CLI. Etapas aceitas: radar, curriculo, candidatura (sempre com --dry-run, salvo confirmação explícita no servidor)
// e login (abre o navegador para a Candidata entrar à mão). Nenhuma regra de candidatura vive aqui.
const { spawn } = require("node:child_process");
const path = require("node:path");

const ETAPAS_PERMITIDAS = Object.freeze({ radar: "--only-radar", curriculo: "--only-cv", candidatura: "--only-apply" });
const PORTAIS_DE_LOGIN = Object.freeze(["gupy", "trampos"]);
const MAX_LINHAS = 500;

/**
 * @param {{ raiz?: string, spawnImpl?: typeof spawn }} [opcoes] `spawnImpl` substitui o processo real (testes)
 */
function criarExecutor(opcoes = {}) {
  const raiz = opcoes.raiz || path.join(__dirname, "..");
  const iniciarProcesso = opcoes.spawnImpl || spawn;
  /** @type {{ rodando: boolean, etapa: string | null, dryRun: boolean, inicio: string | null, fim: string | null, codigo: number | null, linhas: string[] }} */
  let estado = { rodando: false, etapa: null, dryRun: true, inicio: null, fim: null, codigo: null, linhas: [] };

  /** @param {string} texto */
  const acrescentar = (texto) => {
    for (const linha of String(texto).split(/\r?\n/)) if (linha.length > 0) estado.linhas.push(linha.slice(0, 2000));
    if (estado.linhas.length > MAX_LINHAS) estado.linhas = estado.linhas.slice(-MAX_LINHAS);
  };

  /**
   * @param {{ etapa: string, dryRun: boolean, portal?: string | null }} pedido `portal` só vale para a etapa "login"
   * @returns {{ ok: true } | { ok: false, status: number, erro: string }}
   */
  function iniciar({ etapa, dryRun, portal = null }) {
    const ehLogin = etapa === "login";
    if (!ehLogin && !Object.hasOwn(ETAPAS_PERMITIDAS, etapa)) return { ok: false, status: 400, erro: "Etapa não permitida no Dashboard. Use radar, curriculo, candidatura ou login." };
    if (ehLogin && portal !== null && !PORTAIS_DE_LOGIN.includes(portal)) return { ok: false, status: 400, erro: `Portal desconhecido. Use ${PORTAIS_DE_LOGIN.join(" ou ")}, ou nenhum para uma janela em branco.` };
    if (estado.rodando) return { ok: false, status: 409, erro: "Já existe uma Execução em andamento." };

    // --login não combina com --dry-run (a CLI recusa); as demais etapas levam --dry-run quando pedido.
    const flags = ehLogin ? ["--login", ...(portal ? [portal] : [])] : [ETAPAS_PERMITIDAS[/** @type {keyof typeof ETAPAS_PERMITIDAS} */ (etapa)], ...(dryRun ? ["--dry-run"] : [])];
    const argumentos = [path.join(raiz, "pipeline", "cli.js"), ...flags];
    estado = { rodando: true, etapa, dryRun: ehLogin ? false : dryRun, inicio: new Date().toISOString(), fim: null, codigo: null, linhas: [`$ npm run pipeline -- ${argumentos.slice(1).join(" ")}`] };
    const filho = iniciarProcesso(process.execPath, argumentos, { cwd: raiz, windowsHide: true });
    filho.stdout?.on("data", (/** @type {Buffer} */ d) => acrescentar(d.toString("utf8")));
    filho.stderr?.on("data", (/** @type {Buffer} */ d) => acrescentar(d.toString("utf8")));
    filho.on("error", (/** @type {Error} */ erro) => {
      acrescentar(`Erro ao iniciar a CLI: ${erro.message}`);
      estado = { ...estado, rodando: false, fim: new Date().toISOString(), codigo: 1 };
    });
    filho.on("close", (/** @type {number | null} */ codigo) => {
      estado = { ...estado, rodando: false, fim: new Date().toISOString(), codigo: codigo ?? 1 };
    });
    return { ok: true };
  }

  return { iniciar, estado: () => ({ ...estado, linhas: [...estado.linhas] }) };
}

module.exports = { criarExecutor, ETAPAS_PERMITIDAS, PORTAIS_DE_LOGIN };
