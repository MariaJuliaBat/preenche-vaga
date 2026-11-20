// Motor de preenchimento do Auto-Apply (A7 a A11, A14 a A22, A24 e A25). Uma página por vez:
//   coletar (na página) → travas → planejar (puro) → aplicar → validar → [enviar] → Recibo.
// `planejar` é pura e decide TUDO sobre o que vai ser escrito ou marcado; o resto só executa o plano.
// Texto de label, pergunta e opção é comparado com o Mapeamento e nunca interpretado como instrução (A18).
const fs = require("node:fs");
const path = require("node:path");
const { coletar, camposInvalidos } = require("./pagina");
const { reconhecerCampo, ehAceite, escolherOpcao, formatarValor, limpar } = require("./campos");
const { acharInjecao, pedidoSuspeito, falaDeCaptcha, hostPermitido } = require("./travas");

/**
 * @typedef {{ motivo: string, campo?: string }} Motivo
 * @typedef {{ resultado: "enviada" | "pendencia" | "simulada", motivos: Motivo[], preenchidos: number, recibo: string | null, protocolo: string | null }} ResultadoDaPagina
 */

/** Nome do Campo para logs: só o rótulo, nunca o valor (A23). @param {string[]} textos */
const nomeDoCampo = (textos) => (textos.map((t) => String(t || "").trim()).find(Boolean) || "(sem nome)").slice(0, 60);
/** @param {string[]} textos */
const ehCampoDeCv = (textos) => textos.some((t) => /curricul|\bcv\b|resume|anex|arquivo|upload/.test(limpar(t)));

/**
 * Decide o que fazer com cada campo. Pura: sem página, sem rede, sem escrita.
 * @param {ReturnType<typeof coletar>} coleta
 * @param {{ dados: Record<string, string>, temCv: boolean }} contexto
 * @returns {{ acoes: any[], motivos: Motivo[] }}
 */
function planejar(coleta, { dados, temCv }) {
  /** @type {any[]} */ const acoes = [];
  /** @type {Motivo[]} */ const motivos = [];
  const pendencia = (/** @type {string} */ motivo, /** @type {string} */ campo) => motivos.push({ motivo, campo });
  /** @type {Map<string, any[]>} */ const grupos = new Map();
  const arquivos = coleta.campos.filter((/** @type {any} */ c) => c.tipo === "file");
  let cvAnexado = false;

  for (const c of coleta.campos) {
    if (c.tipo === "radio") {
      grupos.set(c.grupo, [...(grupos.get(c.grupo) || []), c]);
    } else if (c.tipo === "file") {
      const ehCv = ehCampoDeCv(c.textos) || arquivos.length === 1;
      if (ehCv && !cvAnexado) {
        if (temCv) { acoes.push({ tipo: "anexar", idx: c.idx }); cvAnexado = true; } else pendencia("CV não encontrado", nomeDoCampo(c.textos));
      } else if (c.obrigatorio) pendencia("anexo obrigatório sem arquivo", nomeDoCampo(c.textos));
    } else if (c.tipo === "checkbox") {
      const textos = [c.rotuloProprio, c.pergunta, ...c.textos];
      if (ehAceite(textos)) { pendencia("aceite de termos", nomeDoCampo([c.rotuloProprio, c.pergunta, ...c.textos])); continue; } // P26/A15: nunca marca
      if (c.marcado) continue;
      const campo = reconhecerCampo(textos);
      const dado = campo ? dados[campo] : undefined;
      if (dado && ["sim", "yes", "true"].includes(limpar(dado))) acoes.push({ tipo: "marcar", idx: c.idx, textosParaTrava: textos });
      else if (c.obrigatorio) pendencia("campo obrigatório sem dado", nomeDoCampo(textos));
    } else if (c.tipo === "select") {
      if (c.padraoDoSelect) continue;
      const campo = reconhecerCampo(c.textos);
      const dado = campo ? dados[campo] : undefined;
      const escolhida = dado ? escolherOpcao(c.opcoes, dado) : null;
      if (escolhida !== null) acoes.push({ tipo: "selecionar", idx: c.idx, opcao: escolhida });
      else if (c.obrigatorio) pendencia(dado ? "opção sem correspondência única" : "campo obrigatório sem dado", nomeDoCampo(c.textos));
    } else {
      if (c.valorAtual.trim()) continue; // A9: não sobrescreve o que já está lá
      const campo = reconhecerCampo(c.textos);
      const dado = campo ? dados[campo] : undefined;
      if (dado) acoes.push({ tipo: "preencher", idx: c.idx, valor: formatarValor(/** @type {string} */ (campo), dado, c.tipo) });
      else if (c.obrigatorio) pendencia(c.tipo === "textarea" && !campo ? "pergunta aberta" : "campo obrigatório sem dado", nomeDoCampo(c.textos)); // A16: nunca inventa
    }
  }

  for (const radios of grupos.values()) {
    const [primeiro] = radios;
    const pergunta = nomeDoCampo([primeiro.pergunta, primeiro.grupo]);
    const textosDoGrupo = [primeiro.pergunta, primeiro.grupo];
    const obrigatorio = radios.some((/** @type {any} */ r) => r.obrigatorio);
    if (ehAceite(textosDoGrupo) || (radios.length === 1 && ehAceite([primeiro.rotuloProprio]))) { pendencia("aceite de termos", pergunta); continue; }
    if (radios.some((/** @type {any} */ r) => r.marcado)) continue;
    const campo = reconhecerCampo(textosDoGrupo);
    const dado = campo ? dados[campo] : undefined;
    const escolhida = dado ? escolherOpcao(radios.map((/** @type {any} */ r) => ({ texto: r.rotuloProprio, valor: r.valorOpcao })), dado) : null;
    if (escolhida !== null) acoes.push({ tipo: "marcar", idx: radios[escolhida].idx, textosParaTrava: [...textosDoGrupo, radios[escolhida].rotuloProprio] });
    else if (obrigatorio) pendencia(dado ? "opção sem correspondência única" : "campo obrigatório sem dado", pergunta);
  }
  return { acoes, motivos };
}

/**
 * Executa o plano. Marcar passa por uma segunda checagem de Aceite: mesmo que o plano erre, o clique não acontece (P26).
 * @param {any} page @param {any[]} acoes @param {string | null} cvPath
 * @returns {Promise<{ feitos: number, motivos: Motivo[] }>}
 */
async function aplicar(page, acoes, cvPath) {
  /** @type {Motivo[]} */ const motivos = [];
  let feitos = 0;
  for (const a of acoes) {
    const alvo = page.locator(`[data-pv-idx="${a.idx}"]`);
    try {
      if (a.tipo === "preencher") await alvo.fill(a.valor, { timeout: 5000 });
      else if (a.tipo === "selecionar") await alvo.selectOption({ index: a.opcao }, { timeout: 5000 });
      else if (a.tipo === "marcar") {
        if (ehAceite(a.textosParaTrava || [])) throw new Error("trava de Aceite (P26)");
        await alvo.check({ timeout: 3000 }).catch(() => alvo.check({ force: true, timeout: 3000 }));
      } else if (a.tipo === "anexar" && cvPath) {
        await alvo.setInputFiles(cvPath, { timeout: 5000 });
        const nome = path.basename(cvPath);
        const aceito = await page.evaluate(
          ({ idx, nome: n }) => document.querySelector(`[data-pv-idx="${idx}"]`)?.files?.[0]?.name === n || document.body.innerText.includes(n),
          { idx: a.idx, nome }
        );
        if (!aceito) { motivos.push({ motivo: "upload não confirmado", campo: "currículo" }); continue; }
      }
      feitos += 1;
    } catch {
      motivos.push({ motivo: "não consegui preencher o campo", campo: a.tipo });
    }
  }
  return { feitos, motivos };
}

const CONFIRMACAO = "candidatura\\s+(foi\\s+)?(enviada|realizada|recebida|conclu[ií]da)|inscri[cç][aã]o\\s+(foi\\s+)?(enviada|realizada|recebida|conclu[ií]da|confirmada)|obrigad[oa]\\s+por\\s+(se\\s+)?(candidatar|se\\s+inscrever)|recebemos\\s+(a\\s+sua|sua)\\s+(candidatura|inscri)";
const BOTAO_ENVIAR = /enviar|candidatar|submit|finalizar|concluir|aplicar/;
const BOTAO_NEGADO = /voltar|cancelar|rascunho|salvar|limpar/;
const BOTAO_PROXIMA_ETAPA = /proxim|continuar|avancar|next/;

/**
 * @param {any} page
 * @param {{ dados: Record<string, string>, cvPath: string | null, enviar: boolean, dryRun: boolean, recibo: { pasta: string, base: string }, dominiosPermitidos: string[] }} opcoes
 * @returns {Promise<ResultadoDaPagina>}
 */
async function candidatarNaPagina(page, { dados, cvPath, enviar, dryRun, recibo, dominiosPermitidos }) {
  let preenchidos = 0;
  const foto = async (/** @type {string} */ sufixo) => {
    try {
      fs.mkdirSync(recibo.pasta, { recursive: true });
      const arquivo = path.join(recibo.pasta, `${recibo.base}-${sufixo}.png`);
      await page.screenshot({ path: arquivo, fullPage: true });
      return arquivo;
    } catch { return null; }
  };
  const parar = async (/** @type {Motivo[]} */ motivos) => ({ resultado: /** @type {"pendencia"} */ ("pendencia"), motivos, preenchidos, recibo: await foto("pendencia"), protocolo: null });

  if (!hostPermitido(page.url(), dominiosPermitidos)) return parar([{ motivo: "domínio fora da lista", campo: new URL(page.url()).hostname }]);

  let coleta = await page.evaluate(coletar);
  if (coleta.temSenha) return parar([{ motivo: "login expirado" }]); // A5: nunca tenta logar
  if (coleta.temCaptcha || falaDeCaptcha(coleta.textoVisivel)) return parar([{ motivo: "captcha ou verificação em duas etapas" }]); // A17

  // A18/A19/A21: antes de escrever qualquer coisa, olha todos os textos como DADO.
  const textosDosCampos = coleta.campos.flatMap((/** @type {any} */ c) => [...c.textos, c.pergunta, c.rotuloProprio, ...c.opcoes.map((/** @type {any} */ o) => o.texto)]).filter(Boolean);
  const trecho = acharInjecao([...textosDosCampos, coleta.textoFormularios]);
  if (trecho) return parar([{ motivo: "texto suspeito", campo: trecho.slice(0, 80) }]);
  if (pedidoSuspeito(textosDosCampos)) return parar([{ motivo: "pedido suspeito (pagamento ou dado bancário)" }]);

  const plano = planejar(coleta, { dados, temCv: Boolean(cvPath) });
  const feito = await aplicar(page, plano.acoes, cvPath);
  preenchidos = feito.feitos;
  const motivos = [...plano.motivos, ...feito.motivos];
  if (motivos.length > 0) return parar(motivos); // A14: já preencheu tudo que pôde; A22: com Pendência, nunca envia

  const invalidos = await page.evaluate(camposInvalidos);
  if (invalidos.length > 0) return parar([{ motivo: "campos obrigatórios inválidos", campo: invalidos.slice(0, 8).join(", ") }]);

  if (dryRun) return { resultado: "simulada", motivos: [], preenchidos, recibo: await foto("simulada"), protocolo: null }; // A27: dry-run vence
  if (!enviar) return parar([{ motivo: "envio desligado (AUTO_SUBMIT=false)" }]); // A22

  coleta = await page.evaluate(coletar);
  const candidatos = coleta.botoes.filter((/** @type {any} */ b) => {
    const t = limpar(b.texto);
    return !b.desabilitado && !BOTAO_NEGADO.test(t) && (b.tipo === "submit" || BOTAO_ENVIAR.test(t));
  });
  const doTipoSubmit = candidatos.filter((/** @type {any} */ b) => b.tipo === "submit");
  const escolhido = candidatos.length === 1 ? candidatos[0] : doTipoSubmit.length === 1 ? doTipoSubmit[0] : null;
  if (!escolhido) {
    const emEtapas = coleta.botoes.some((/** @type {any} */ b) => BOTAO_PROXIMA_ETAPA.test(limpar(b.texto)));
    return parar([{ motivo: emEtapas ? "formulário em várias etapas: preenchi esta, siga você" : candidatos.length > 1 ? "mais de um botão de envio" : "botão de envio não encontrado" }]);
  }

  const jaConfirmava = new RegExp(CONFIRMACAO, "i").test(coleta.textoVisivel);
  const urlAntes = page.url();
  await page.locator(`[data-pv-btn="${escolhido.idx}"]`).click({ timeout: 5000 }).catch(() => {});
  const confirmou = await page
    .waitForFunction((fonte) => new RegExp(fonte, "i").test(document.body.innerText), CONFIRMACAO, { timeout: 8000 })
    .then(() => !jaConfirmava)
    .catch(() => false);
  if (!confirmou && !(jaConfirmava && page.url() !== urlAntes)) return parar([{ motivo: "envio não confirmado na tela" }]);

  const texto = await page.evaluate(() => document.body.innerText).catch(() => "");
  const protocolo = /protocolo[:\s#nº°]*([A-Z0-9-]{4,})/i.exec(texto)?.[1] || null;
  return { resultado: "enviada", motivos: [], preenchidos, recibo: await foto("recibo"), protocolo };
}

module.exports = { planejar, aplicar, candidatarNaPagina, nomeDoCampo };
