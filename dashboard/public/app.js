// Front-end do Dashboard. Todo texto vindo do Pipeline (vaga, motivo, saída da CLI) entra por textContent, nunca como HTML (D13).
"use strict";

const $ = (id) => document.getElementById(id);

/** Cria um elemento com texto seguro. */
function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "texto") e.textContent = v;
    else if (k === "classe") e.className = v;
    else e.setAttribute(k, v);
  }
  for (const f of filhos) if (f) e.append(f);
  return e;
}

async function api(rota, opcoes) {
  const resposta = await fetch(rota, opcoes);
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro || `Erro ${resposta.status}`);
  return corpo;
}

const formatarData = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

// ---- Abas ----
let abaAtual = "operar";
function irParaAba(nome) {
  abaAtual = nome;
  for (const b of document.querySelectorAll(".abas button")) b.setAttribute("aria-selected", String(b.dataset.aba === nome));
  for (const p of document.querySelectorAll(".painel")) p.hidden = p.id !== `aba-${nome}`;
  if (nome === "curriculos") carregarCurriculos();
  if (nome === "auditoria") carregarAuditoria();
  if (nome === "cota" || nome === "operar") atualizarEstado();
}
for (const b of document.querySelectorAll(".abas button")) b.addEventListener("click", () => irParaAba(b.dataset.aba));

// ---- Estado, Cota e Execução ----
function mostrarCota(estado) {
  const { cota, lote, loteGeradoEm } = estado;
  const resumo = $("cota-resumo");
  resumo.replaceChildren();
  const barra = $("cota-barra");
  if (cota.semLote) {
    resumo.append(el("p", { classe: "numero", texto: "Sem lote" }), el("p", { classe: "dica", texto: "Ainda não há Lote Final salvo. Rode o Radar na aba Operar." }));
    barra.style.width = "0%";
    $("cota-legenda").textContent = "";
  } else {
    const ok = cota.atingida;
    resumo.append(
      el("p", { classe: `numero ${ok ? "ok" : "abaixo"}`, texto: `${cota.percentual}% em Brasília - DF` }),
      el("p", { classe: "dica", texto: `${cota.emDF} de ${cota.total} vagas · ${cota.remotas} remotas · cota necessária: ${cota.cotaNecessaria} · ${ok ? "atingida" : "abaixo da cota"}` })
    );
    barra.style.width = `${cota.percentual}%`;
    barra.classList.toggle("abaixo", !ok);
    $("cota-legenda").textContent = `A linha marca a meta de 50%. Lote gerado em ${formatarData(loteGeradoEm)}.`;
  }
  $("lote").replaceChildren(...lote.map((v) => el("li", {}, el("span", { texto: `${v.titulo}${v.empresa ? ` (${v.empresa})` : ""}` }), el("span", { classe: "etiqueta", texto: `${v.ehVagaDF ? "Brasília - DF" : "Remota"} · ${v.pontos} pts` }))));
}

function mostrarExecucao(exec) {
  const saida = $("saida");
  const noFim = saida.scrollTop + saida.clientHeight >= saida.scrollHeight - 8;
  saida.textContent = exec.linhas.join("\n");
  if (noFim) saida.scrollTop = saida.scrollHeight;
  const status = $("status-execucao");
  if (exec.rodando) { status.className = "status"; status.textContent = exec.etapa === "login" ? "Janela de login aberta no seu computador: entre na conta e feche a janela." : `Rodando ${exec.etapa}${exec.dryRun ? " (simulação)" : ""}…${exec.etapa === "candidatura" && !exec.dryRun ? " (abas com Pendência ficam abertas: termine à mão e feche a janela)" : ""}`; }
  else if (exec.fim) { status.className = `status ${exec.codigo === 0 ? "ok" : "erro"}`; status.textContent = exec.codigo === 0 ? `Concluído (${exec.etapa}).` : `Terminou com erro (código ${exec.codigo}).`; }
  for (const id of BOTOES_DE_EXECUCAO) $(id).disabled = exec.rodando;
}

let autoSubmitLigado = false;
const BOTOES_DE_EXECUCAO = ["rodar-radar", "rodar-cv", "rodar-candidatura", "login-gupy", "login-trampos", "login-branco"];
let esperaAnterior = false;
async function atualizarEstado() {
  try {
    const estado = await api("/api/estado");
    autoSubmitLigado = estado.modo.autoSubmit;
    $("modo").textContent = estado.modo.autoSubmit ? "AUTO_SUBMIT ligado" : "AUTO_SUBMIT desligado";
    const total = Object.values(estado.contagens).reduce((a, b) => a + b, 0);
    $("contagem-auditoria").textContent = total > 0 ? String(total) : "";
    mostrarCota(estado);
    mostrarExecucao(estado.execucao);
    if (esperaAnterior && !estado.execucao.rodando) {
      if (abaAtual === "curriculos") carregarCurriculos();
      if (abaAtual === "auditoria") carregarAuditoria();
    }
    esperaAnterior = estado.execucao.rodando;
  } catch (erro) {
    $("status-execucao").className = "status erro";
    $("status-execucao").textContent = erro.message;
  }
}

async function executar(etapa, extra = {}) {
  const simulacao = $("simulacao").checked;
  if (!simulacao && etapa !== "candidatura" && !window.confirm("Sem simulação, o Pipeline escreve na planilha. Continuar?")) return;
  await enviarExecucao({ etapa, dryRun: simulacao, ...(simulacao ? {} : { confirmar: true }), ...extra });
}

// A candidatura sem simulação passa por um painel de confirmação explícito (D16) e só então leva confirmarEnvioReal.
function pedirCandidatura() {
  if ($("simulacao").checked) return executar("candidatura");
  $("confirma-texto").textContent = autoSubmitLigado
    ? "AUTO_SUBMIT está ligado: o Pipeline vai ENVIAR as vagas marcadas \"Se candidatar\" na planilha que não tiverem nenhuma trava (aceite de termos, pergunta aberta, CAPTCHA...). As demais viram Pendência."
    : "AUTO_SUBMIT está desligado: nada será enviado. Os formulários serão preenchidos e as vagas viram Pendência, com a planilha atualizada.";
  $("confirma-envio").hidden = false;
  $("confirma-nao").focus();
}
$("confirma-nao").addEventListener("click", () => { $("confirma-envio").hidden = true; });
$("confirma-sim").addEventListener("click", () => {
  $("confirma-envio").hidden = true;
  executar("candidatura", { confirmarEnvioReal: true });
});

async function enviarExecucao(corpo) {
  try {
    const exec = await api("/api/execucoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo)
    });
    mostrarExecucao(exec);
  } catch (erro) {
    $("status-execucao").className = "status erro";
    $("status-execucao").textContent = erro.message;
  }
}
$("rodar-radar").addEventListener("click", () => executar("radar"));
$("rodar-cv").addEventListener("click", () => executar("curriculo"));
$("rodar-candidatura").addEventListener("click", pedirCandidatura);
$("login-gupy").addEventListener("click", () => enviarExecucao({ etapa: "login", portal: "gupy" }));
$("login-trampos").addEventListener("click", () => enviarExecucao({ etapa: "login", portal: "trampos" }));
$("login-branco").addEventListener("click", () => enviarExecucao({ etapa: "login" }));

// ---- Currículos ----
let pdfAtual = null;
async function carregarCurriculos() {
  const pdfs = await api("/api/curriculos").catch(() => []);
  const lista = $("lista-pdfs");
  if (pdfs.length === 0) { lista.replaceChildren(el("li", { classe: "dica", texto: "Nenhum PDF ainda. Rode \"Gerar currículos\"." })); return; }
  lista.replaceChildren(...pdfs.map((p) => {
    const botao = el("button", { classe: "item", type: "button", texto: p.nome });
    if (p.nome === pdfAtual) botao.setAttribute("aria-current", "true");
    botao.addEventListener("click", () => abrirPdf(p.nome));
    return el("li", {}, botao, el("span", { classe: "etiqueta", texto: formatarData(p.geradoEm) }));
  }));
}
function abrirPdf(nome) {
  pdfAtual = nome;
  $("pdf-vazio").hidden = true;
  $("pdf").hidden = false;
  $("pdf").src = `/cvs/${encodeURIComponent(nome)}?v=${Date.now()}`;
  carregarCurriculos();
}

// ---- Auditoria ----
let logAtual = "pendencias";
let dadosDoLog = { registros: [], porMotivo: {}, existe: false };
let motivoAtivo = null;
const AVISOS = {
  pendencias: "Candidaturas pausadas para você resolver (login, CAPTCHA, pergunta sem resposta segura). A Etapa candidatura ainda é futura, então esta lista fica vazia por enquanto.",
  pistas: "Vagas promissoras sem link individual ou sem data confirmada, para revisão manual.",
  descartes: "Vagas recusadas pelo Radar, cada uma com o motivo."
};

async function carregarAuditoria() {
  dadosDoLog = await api(`/api/auditoria/${logAtual}`).catch(() => ({ registros: [], porMotivo: {}, existe: false }));
  motivoAtivo = null;
  desenharAuditoria();
}
function desenharAuditoria() {
  const filtro = $("filtro").value.trim().toLowerCase();
  const motivos = $("motivos");
  motivos.replaceChildren(...Object.entries(dadosDoLog.porMotivo).map(([m, n]) => {
    const chip = el("button", { classe: "chip", type: "button", "aria-pressed": String(m === motivoAtivo), texto: `${m} · ${n}` });
    chip.addEventListener("click", () => { motivoAtivo = motivoAtivo === m ? null : m; desenharAuditoria(); });
    return chip;
  }));
  const visiveis = dadosDoLog.registros.filter((r) =>
    (!motivoAtivo || String(r.motivo || "sem motivo") === motivoAtivo)
    && (!filtro || JSON.stringify(r).toLowerCase().includes(filtro)));
  $("auditoria-aviso").textContent = `${AVISOS[logAtual]} Mostrando ${visiveis.length} de ${dadosDoLog.total ?? 0}.`;
  $("auditoria-corpo").replaceChildren(...visiveis.map((r) => {
    const titulo = el("td", {}, r.url && /^https?:\/\//i.test(String(r.url))
      ? el("a", { href: String(r.url), target: "_blank", rel: "noopener noreferrer", texto: String(r.titulo || r.url) })
      : el("span", { texto: String(r.titulo || "(sem título)") }));
    return el("tr", {}, el("td", { texto: formatarData(r.data) }), titulo, el("td", { texto: [r.motivo, r.detalhe].filter(Boolean).join(": ") }), el("td", { texto: String(r.fonte || "") }));
  }));
}
for (const b of document.querySelectorAll(".sub-abas button")) {
  b.addEventListener("click", () => {
    logAtual = b.dataset.log;
    for (const o of document.querySelectorAll(".sub-abas button")) o.setAttribute("aria-selected", String(o === b));
    carregarAuditoria();
  });
}
$("filtro").addEventListener("input", desenharAuditoria);

atualizarEstado();
setInterval(atualizarEstado, 2000);
