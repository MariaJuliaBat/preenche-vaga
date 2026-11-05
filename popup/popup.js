// Contexto Cadastro de Currículo: a Candidata cadastra o Currículo uma única vez
// (salvo em chrome.storage.local, só neste navegador) e pede para Preencher a página atual.
// Este arquivo nunca Envia formulário de site nenhum: só injeta os scripts de content/.
(() => {
  const DADOS = ["nome", "email", "telefone", "linkedin", "portfolio", "cidade"];

  const formulario = /** @type {HTMLFormElement} */ (document.getElementById("curriculo"));
  const botaoPreencher = /** @type {HTMLButtonElement} */ (document.getElementById("preencher"));
  const status = /** @type {HTMLElement} */ (document.getElementById("status"));

  /** @param {string} id */
  const campo = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));

  /** @param {string} mensagem */
  const avisar = (mensagem) => { status.textContent = mensagem; };

  /** @returns {Promise<Record<string, string>>} */
  const lerCurriculo = async () => {
    const salvo = await chrome.storage.local.get("curriculo");
    return /** @type {Record<string, string> | undefined} */ (salvo.curriculo) || {};
  };

  const mostrarCurriculo = async () => {
    const curriculo = await lerCurriculo();
    for (const dado of DADOS) campo(dado).value = curriculo[dado] || "";
  };

  // Salvar o Currículo: o evento "submit" aqui é do formulário do próprio popup, nunca da página da vaga.
  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    /** @type {Record<string, string>} */
    const curriculo = {};
    for (const dado of DADOS) {
      const valor = campo(dado).value.trim();
      if (valor) curriculo[dado] = valor;
    }
    await chrome.storage.local.set({ curriculo });
    avisar("Currículo salvo neste navegador.");
  });

  botaoPreencher.addEventListener("click", async () => {
    const curriculo = await lerCurriculo();
    if (Object.keys(curriculo).length === 0) {
      avisar("Cadastre e salve seu Currículo primeiro.");
      return;
    }

    const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!aba || aba.id === undefined) {
      avisar("Não encontrei a aba atual.");
      return;
    }

    try {
      const alvo = { tabId: aba.id };
      await chrome.scripting.executeScript({
        target: alvo,
        func: (dados) => { globalThis.CURRICULO = dados; },
        args: [curriculo]
      });
      const resultados = await chrome.scripting.executeScript({
        target: alvo,
        files: ["content/mapeamento.js", "content/preencher.js"]
      });
      const total = Number(resultados[0]?.result) || 0;
      avisar(total > 0
        ? `${total} Campo(s) preenchido(s). Revise tudo antes de enviar.`
        : "Nenhum Campo reconhecido nesta página.");
    } catch {
      avisar("Não consigo preencher esta página (páginas do Chrome e da loja de extensões são bloqueadas).");
    }
  });

  mostrarCurriculo();
})();
