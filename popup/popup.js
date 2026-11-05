// Contexto Cadastro de Currículo: a Candidata cadastra o Currículo uma única vez, digitando
// ou importando um .docx, e o guarda em chrome.storage.local (só neste navegador).
// Depois pede para Preencher a página atual.
// Este arquivo nunca Envia formulário de site nenhum: só injeta os scripts de content/.
(() => {
  // Dados do Currículo que a extensão sabe Preencher (um Campo do popup para cada).
  const DADOS = [
    "nome", "email", "telefone", "cidade", "linkedin", "portfolio",
    "objetivo", "resumo", "curso", "instituicao", "cargo", "empresa", "habilidades", "idiomas"
  ];

  const formulario = /** @type {HTMLFormElement} */ (document.getElementById("curriculo"));
  const botaoPreencher = /** @type {HTMLButtonElement} */ (document.getElementById("preencher"));
  const entradaArquivo = /** @type {HTMLInputElement} */ (document.getElementById("arquivo"));
  const status = /** @type {HTMLElement} */ (document.getElementById("status"));

  // Currículo completo lido do .docx (experiências, projetos...). Guardado para a futura automação.
  /** @type {CurriculoCompleto | undefined} */
  let curriculoCompleto;

  /** @param {string} id */
  const campo = (id) => /** @type {HTMLInputElement | HTMLTextAreaElement} */ (document.getElementById(id));

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
    const salvo = await chrome.storage.local.get("curriculoCompleto");
    curriculoCompleto = /** @type {CurriculoCompleto | undefined} */ (salvo.curriculoCompleto);
  };

  // Importar: lê o .docx aqui no popup e só preenche os campos para a Candidata revisar.
  // Nada é salvo até ela clicar em "Salvar Currículo".
  entradaArquivo.addEventListener("change", async () => {
    const arquivo = entradaArquivo.files?.[0];
    if (!arquivo) return;
    try {
      const { completo, campos } = await ImportarDocx.importar(await arquivo.arrayBuffer());
      for (const dado of DADOS) campo(dado).value = campos[dado] || "";
      curriculoCompleto = completo;
      avisar(
        `Li ${completo.experiencias.length} experiência(s), ${completo.educacao.length} formação(ões) e `
        + `${completo.projetos.length} projeto(s). Revise os campos e clique em Salvar Currículo.`
      );
    } catch (erro) {
      avisar(erro instanceof Error ? erro.message : "Não consegui ler este arquivo.");
    }
    entradaArquivo.value = "";
  });

  // Salvar o Currículo: o evento "submit" aqui é do formulário do próprio popup, nunca da página da vaga.
  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    /** @type {Record<string, string>} */
    const curriculo = {};
    for (const dado of DADOS) {
      const valor = campo(dado).value.trim();
      if (valor) curriculo[dado] = valor;
    }
    await chrome.storage.local.set({ curriculo, curriculoCompleto });
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
