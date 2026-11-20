// Código que roda DENTRO da página (via page.evaluate). Só lê e etiqueta; quem decide é o Node (planejar em motor.js).
// Cada função é autocontida: o Playwright a serializa, então ela não pode usar nada de fora.

/**
 * Descreve os campos e a página. Etiqueta cada elemento com data-pv-idx para o Node achá-lo depois.
 * Nada é preenchido, clicado ou enviado aqui.
 */
function coletar() {
  const limpar = (/** @type {string | null | undefined} */ t) => String(t || "").replace(/\s+/g, " ").trim();
  const visivel = (/** @type {Element} */ el) => {
    if (!el.getClientRects().length) return false;
    const estilo = getComputedStyle(el);
    return estilo.visibility !== "hidden" && estilo.display !== "none";
  };
  const rotulos = (/** @type {any} */ el) => [...(el.labels || [])].map((l) => limpar(l.textContent));
  const aria = (/** @type {Element} */ el) => {
    const ids = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    const referenciados = ids.map((i) => limpar(document.getElementById(i)?.textContent));
    return [limpar(el.getAttribute("aria-label")), ...referenciados].filter(Boolean);
  };
  const pergunta = (/** @type {Element} */ el) => {
    const grupo = el.closest("fieldset");
    const legenda = limpar(grupo?.querySelector("legend")?.textContent);
    if (legenda) return legenda;
    const papel = el.closest('[role="radiogroup"],[role="group"]');
    return (papel ? aria(papel)[0] : "") || "";
  };

  /** @type {any[]} */
  const campos = [];
  let idx = 0;
  for (const el of /** @type {NodeListOf<any>} */ (document.querySelectorAll("input, textarea, select"))) {
    const tipo = el.tagName === "INPUT" ? String(el.type || "text").toLowerCase() : el.tagName.toLowerCase();
    if (["hidden", "submit", "reset", "button", "image", "password"].includes(tipo)) continue;
    if (el.disabled || el.readOnly || !visivel(el)) continue;
    el.setAttribute("data-pv-idx", String(idx));
    const opcoes = tipo === "select" ? [...el.options].map((/** @type {any} */ o) => ({ texto: limpar(o.textContent), valor: String(o.value) })) : [];
    campos.push({
      idx: idx++,
      tipo,
      textos: [...rotulos(el), ...aria(el), el.getAttribute("name") || "", el.id || "", el.getAttribute("placeholder") || ""],
      pergunta: tipo === "radio" || tipo === "checkbox" ? pergunta(el) : "",
      grupo: tipo === "radio" ? String(el.name || `radio-${idx}`) : "",
      valorOpcao: tipo === "radio" || tipo === "checkbox" ? String(el.value || "") : "",
      rotuloProprio: tipo === "radio" || tipo === "checkbox" ? (rotulos(el)[0] || aria(el)[0] || String(el.value || "")) : "",
      valorAtual: tipo === "select" ? String(el.value) : tipo === "radio" || tipo === "checkbox" ? "" : String(el.value || ""),
      marcado: Boolean(el.checked),
      obrigatorio: Boolean(el.required) || el.getAttribute("aria-required") === "true",
      opcoes,
      padraoDoSelect: tipo === "select" && el.selectedIndex >= 0 && Boolean(el.options[el.selectedIndex]?.defaultSelected) && el.value !== ""
    });
  }

  const botoes = [];
  let b = 0;
  for (const el of /** @type {NodeListOf<any>} */ (document.querySelectorAll('button, input[type="submit"]'))) {
    if (!visivel(el)) continue;
    el.setAttribute("data-pv-btn", String(b));
    botoes.push({ idx: b++, texto: limpar(el.tagName === "INPUT" ? el.value : el.textContent), tipo: String(el.type || ""), desabilitado: Boolean(el.disabled) });
  }

  const formularios = [...document.forms].map((f) => limpar(f.innerText));
  return {
    host: location.hostname,
    campos,
    botoes,
    temSenha: [...document.querySelectorAll('input[type="password"]')].some(visivel),
    temCaptcha: Boolean(document.querySelector('iframe[src*="captcha" i], .g-recaptcha, .h-captcha, [data-sitekey], #captcha, [id*="captcha" i]')),
    textoVisivel: limpar(document.body?.innerText).slice(0, 30000),
    textoFormularios: limpar(formularios.join(" ")).slice(0, 30000)
  };
}

/** Quais campos estão inválidos (obrigatório vazio etc.): só nomes, nunca valores. */
function camposInvalidos() {
  return [...document.querySelectorAll(":invalid")]
    .filter((e) => e.tagName !== "FORM" && e.tagName !== "FIELDSET")
    .map((e) => String(e.getAttribute("name") || e.id || e.tagName.toLowerCase()).slice(0, 60));
}

module.exports = { coletar, camposInvalidos };
