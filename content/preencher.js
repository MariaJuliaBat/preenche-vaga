(() => {
  /** @type {Record<string, string>} */
  const curriculo = {
    nome: "Ana Souza",
    email: "ana@exemplo.com",
    telefone: "(11) 99999-0000",
    linkedin: "linkedin.com/in/anasouza",
    portfolio: "github.com/anasouza-exemplo",
    cidade: "São Paulo"
  };

  /** @param {string} texto */
  const normalizar = (texto) => texto
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  /** @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} elemento */
  const obterTextosDoCampo = (elemento) => {
    const labels = Array.from(elemento.labels || [], (label) => (label.textContent || "").trim());
    return [
      ...labels,
      elemento.getAttribute("name") || "",
      elemento.id,
      elemento.getAttribute("placeholder") || ""
    ];
  };

  /** @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} elemento */
  const encontrarCampo = (elemento) => {
    const textos = obterTextosDoCampo(elemento).map(normalizar);
    for (const texto of textos) {
      const correspondencia = MAPEAMENTO_CAMPOS.find((item) =>
        item.palavras.some((palavra) => texto.includes(normalizar(palavra)))
      );
      if (correspondencia) return correspondencia.campo;
    }
    return null;
  };

  /**
   * @param {HTMLSelectElement} elemento
   * @param {string} valor
   */
  const preencherSelect = (elemento, valor) => {
    const valorNormalizado = normalizar(valor);
    const opcao = Array.from(elemento.options).find((item) =>
      normalizar(item.textContent).includes(valorNormalizado)
      || normalizar(item.value).includes(valorNormalizado)
    );
    if (!opcao) return false;
    elemento.value = opcao.value;
    return true;
  };

  /** @type {NodeListOf<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>} */
  const campos = document.querySelectorAll("input, textarea, select");

  for (const elemento of campos) {
    if (elemento.disabled || ("readOnly" in elemento && elemento.readOnly)) continue;
    if (elemento.value.trim()) continue;
    if (elemento instanceof HTMLInputElement
      && ["hidden", "checkbox", "radio", "file", "submit", "reset", "button", "image"].includes(elemento.type)) {
      continue;
    }

    const campo = encontrarCampo(elemento);
    if (!campo) continue;
    const valor = curriculo[campo];
    if (!valor) continue;

    const preenchido = elemento instanceof HTMLSelectElement
      ? preencherSelect(elemento, valor)
      : (elemento.value = valor, true);
    if (!preenchido) continue;

    elemento.dispatchEvent(new Event("input", { bubbles: true }));
    elemento.dispatchEvent(new Event("change", { bubbles: true }));
  }
})();