#!/usr/bin/env node
// Dashboard local do Pipeline (docs/specs/dashboard.md): escuta só em 127.0.0.1, lê output/ e inicia a CLI.
// Sem dependências nem etapa de build. Nunca envia candidatura.
//   npm run dashboard        → http://127.0.0.1:4173
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { lerArquivoEnv, montarConfig } = require("../pipeline/config");
const { calcularCota, lerLote, listarCurriculos, caminhoDoPdf, lerLog, ARQUIVOS_DE_LOG } = require("./dados");
const { criarExecutor } = require("./executor");

const HOST = "127.0.0.1";
const PORTA_PADRAO = 4173;
const PUBLICO = path.join(__dirname, "public");
const ESTATICOS = Object.freeze({
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/estilo.css": ["estilo.css", "text/css; charset=utf-8"]
});
const LIMITE_DO_CORPO = 4096;

/** Host aceito: só o próprio endereço local (D2). @param {string | undefined} valor */
const hostLocal = (valor) => /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(valor || "");

/**
 * D2 e D3. Devolve o erro ou null.
 * @param {http.IncomingMessage} req
 */
function validarRequisicao(req) {
  if (!hostLocal(req.headers.host)) return "Host não permitido.";
  if (req.method === "POST") {
    if (!/^application\/json\b/i.test(String(req.headers["content-type"] || ""))) return "Use Content-Type: application/json.";
    const origem = req.headers.origin;
    if (origem !== undefined && !(/^https?:\/\//i.test(origem) && hostLocal(origem.replace(/^https?:\/\//i, "")))) return "Origem não permitida.";
  }
  return null;
}

/** @param {http.ServerResponse} res @param {number} status @param {unknown} corpo */
function json(res, status, corpo) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(corpo));
}

/** @param {http.IncomingMessage} req @returns {Promise<any>} */
function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let texto = "";
    req.on("data", (pedaco) => {
      texto += pedaco;
      if (texto.length > LIMITE_DO_CORPO) { reject(new Error("Corpo grande demais.")); req.destroy(); }
    });
    req.on("end", () => { try { resolve(texto ? JSON.parse(texto) : {}); } catch { reject(new Error("JSON inválido.")); } });
    req.on("error", reject);
  });
}

/**
 * @param {{ config: ReturnType<typeof montarConfig>, executor?: ReturnType<typeof criarExecutor> }} args
 */
function criarServidor({ config, executor = criarExecutor() }) {
  return http.createServer(async (req, res) => {
    try {
      const proibido = validarRequisicao(req);
      if (proibido) return json(res, 403, { erro: proibido });
      const url = new URL(req.url || "/", `http://${HOST}`);
      const rota = url.pathname;

      if (req.method === "GET" && Object.hasOwn(ESTATICOS, rota)) {
        const [arquivo, tipo] = ESTATICOS[/** @type {keyof typeof ESTATICOS} */ (rota)];
        res.writeHead(200, {
          "Content-Type": tipo,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'self'; frame-src 'self'; object-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'"
        });
        return res.end(fs.readFileSync(path.join(PUBLICO, arquivo)));
      }

      if (req.method === "GET" && rota === "/favicon.ico") { res.writeHead(204); return res.end(); }

      if (req.method === "GET" && rota === "/api/estado") {
        const lote = lerLote(config);
        return json(res, 200, {
          modo: { autoSubmit: config.autoSubmit },
          cota: calcularCota(lote.vagas),
          loteGeradoEm: lote.geradoEm,
          lote: lote.vagas.map((v) => ({ titulo: String(v.titulo || ""), empresa: String(v.empresa || ""), url: String(v.url || ""), ehVagaDF: Boolean(v.ehVagaDF), pontos: Number(v.pontos) || 0 })),
          contagens: Object.fromEntries(Object.keys(ARQUIVOS_DE_LOG).map((t) => [t, lerLog(config, /** @type {keyof typeof ARQUIVOS_DE_LOG} */ (t)).total])),
          execucao: executor.estado()
        });
      }

      if (req.method === "GET" && rota === "/api/curriculos") return json(res, 200, listarCurriculos(config));

      if (req.method === "GET" && rota.startsWith("/cvs/")) {
        let nome = "";
        try { nome = decodeURIComponent(rota.slice(5)); } catch { /* nome inválido cai no 404 */ }
        const arquivo = caminhoDoPdf(config, nome);
        if (!arquivo) return json(res, 404, { erro: "PDF não encontrado." });
        res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        return res.end(fs.readFileSync(arquivo));
      }

      const log = /^\/api\/auditoria\/(pendencias|pistas|descartes)$/.exec(rota);
      if (req.method === "GET" && log) return json(res, 200, lerLog(config, /** @type {keyof typeof ARQUIVOS_DE_LOG} */ (log[1])));

      if (req.method === "GET" && rota === "/api/execucao") return json(res, 200, executor.estado());

      if (req.method === "POST" && rota === "/api/execucoes") {
        const corpo = await lerCorpo(req);
        const dryRun = corpo.dryRun !== false; // D6: simulação é o padrão
        if (!dryRun && corpo.confirmar !== true) return json(res, 400, { erro: "Sem simulação a planilha é escrita: envie confirmar: true." });
        const resultado = executor.iniciar({ etapa: String(corpo.etapa || ""), dryRun });
        return resultado.ok ? json(res, 202, executor.estado()) : json(res, resultado.status, { erro: resultado.erro });
      }

      return json(res, 404, { erro: "Rota não encontrada." });
    } catch (erro) {
      return json(res, 400, { erro: erro instanceof Error ? erro.message : "Erro." });
    }
  });
}

if (require.main === module) {
  const env = { ...lerArquivoEnv(), ...process.env };
  const config = montarConfig(env);
  const porta = Number.parseInt(env.DASHBOARD_PORT || "", 10) || PORTA_PADRAO;
  criarServidor({ config }).listen(porta, HOST, () => console.log(`Dashboard em http://${HOST}:${porta} (Ctrl+C para sair)`));
}

module.exports = { criarServidor, validarRequisicao, HOST };
