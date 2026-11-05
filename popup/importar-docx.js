// Contexto Cadastro de Currículo: lê um arquivo .docx e transforma em Dados do Currículo.
// Tudo acontece no navegador da Candidata: o arquivo nunca é enviado a lugar nenhum.
// Um .docx é um zip; lemos o texto de word/document.xml e os links de word/_rels.
(() => {
  const ASSINATURA_FIM = 0x06054b50;
  const ASSINATURA_CENTRAL = 0x02014b50;

  /** @param {string} texto */
  const normalizar = (texto) => texto
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

  // ---------- 1. Ler o .docx (zip) ----------

  /**
   * @param {ArrayBuffer} buffer
   * @returns {Map<string, { metodo: number, tamanho: number, deslocamento: number }>}
   */
  const listarEntradas = (buffer) => {
    const bytes = new Uint8Array(buffer);
    const vista = new DataView(buffer);
    let fim = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (vista.getUint32(i, true) === ASSINATURA_FIM) { fim = i; break; }
    }
    if (fim < 0) throw new Error("Este arquivo não parece ser um .docx. Salve o currículo como .docx e tente de novo.");

    const total = vista.getUint16(fim + 10, true);
    let pos = vista.getUint32(fim + 16, true);
    const entradas = new Map();
    for (let n = 0; n < total; n++) {
      if (vista.getUint32(pos, true) !== ASSINATURA_CENTRAL) break;
      const tamanhoNome = vista.getUint16(pos + 28, true);
      const tamanhoExtra = vista.getUint16(pos + 30, true);
      const tamanhoComentario = vista.getUint16(pos + 32, true);
      const nome = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + tamanhoNome));
      entradas.set(nome, {
        metodo: vista.getUint16(pos + 10, true),
        tamanho: vista.getUint32(pos + 20, true),
        deslocamento: vista.getUint32(pos + 42, true)
      });
      pos += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario;
    }
    return entradas;
  };

  /**
   * @param {ArrayBuffer} buffer
   * @param {{ metodo: number, tamanho: number, deslocamento: number }} entrada
   * @returns {Promise<string>}
   */
  const lerEntrada = async (buffer, entrada) => {
    const vista = new DataView(buffer);
    const tamanhoNome = vista.getUint16(entrada.deslocamento + 26, true);
    const tamanhoExtra = vista.getUint16(entrada.deslocamento + 28, true);
    const inicio = entrada.deslocamento + 30 + tamanhoNome + tamanhoExtra;
    const dados = new Uint8Array(buffer, inicio, entrada.tamanho);
    if (entrada.metodo === 0) return new TextDecoder().decode(dados);
    if (entrada.metodo !== 8) throw new Error("Este .docx usa uma compressão que eu não consigo ler.");
    const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new TextDecoder().decode(await new Response(fluxo).arrayBuffer());
  };

  /** @param {string} texto */
  const decodificar = (texto) => texto.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (inteiro, codigo) => {
    /** @type {Record<string, string>} */
    const nomes = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    const minusculo = String(codigo).toLowerCase();
    if (minusculo in nomes) return nomes[minusculo];
    const numero = minusculo.startsWith("#x") ? parseInt(minusculo.slice(2), 16) : parseInt(minusculo.slice(1), 10);
    return Number.isFinite(numero) ? String.fromCodePoint(numero) : inteiro;
  });

  /** Junta o texto (<w:t>) de um trecho de XML do Word. @param {string} xml */
  const textoDe = (xml) => {
    let texto = "";
    for (const achado of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|(<w:tab\s*\/>|<w:br\s*\/>)/g)) {
      texto += achado[2] ? " " : decodificar(achado[1] ?? "");
    }
    return texto;
  };

  /**
   * @param {ArrayBuffer} buffer
   * @returns {Promise<{ paragrafos: string[], links: { texto: string, url: string }[] }>}
   */
  const lerDocx = async (buffer) => {
    const entradas = listarEntradas(buffer);
    const documento = entradas.get("word/document.xml");
    if (!documento) throw new Error("Não encontrei o texto do currículo dentro do .docx.");
    const xml = await lerEntrada(buffer, documento);

    /** @type {Record<string, string>} */
    const alvos = {};
    const relacoes = entradas.get("word/_rels/document.xml.rels");
    if (relacoes) {
      for (const tag of (await lerEntrada(buffer, relacoes)).match(/<Relationship\b[^>]*>/g) || []) {
        const id = /\bId="([^"]*)"/.exec(tag)?.[1];
        const alvo = /\bTarget="([^"]*)"/.exec(tag)?.[1];
        if (id && alvo) alvos[id] = decodificar(alvo);
      }
    }

    /** @type {string[]} */
    const paragrafos = [];
    /** @type {{ texto: string, url: string }[]} */
    const links = [];
    for (const paragrafo of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []) {
      for (const achado of paragrafo.matchAll(/<w:hyperlink\b[^>]*\br:id="([^"]*)"[^>]*>([\s\S]*?)<\/w:hyperlink>/g)) {
        const url = alvos[achado[1]];
        if (url) links.push({ texto: textoDe(achado[2]).trim(), url });
      }
      const texto = textoDe(paragrafo).replace(/\s+/g, " ").trim();
      if (texto) paragrafos.push(texto);
    }
    return { paragrafos, links };
  };

  // ---------- 2. Interpretar o texto ----------

  // Título de seção (normalizado, sem acento) -> nome da seção.
  const CABECALHOS = new Map([
    ["objetivo", "objetivo"], ["objetivo profissional", "objetivo"],
    ["resumo", "resumo"], ["resumo profissional", "resumo"], ["sobre mim", "resumo"], ["perfil", "resumo"], ["perfil profissional", "resumo"],
    ["educacao", "educacao"], ["formacao", "educacao"], ["formacao academica", "educacao"], ["escolaridade", "educacao"],
    ["experiencia", "experiencia"], ["experiencia profissional", "experiencia"], ["historico profissional", "experiencia"],
    ["projetos", "projetos"], ["projetos pessoais", "projetos"],
    ["habilidades", "habilidades"], ["habilidades tecnicas", "habilidades"], ["habilidades tecnicas e idiomas", "habilidades"],
    ["competencias", "habilidades"], ["tecnologias", "habilidades"],
    ["idiomas", "idiomas"],
    ["cursos", "cursos"], ["cursos e certificacoes", "cursos"], ["certificacoes", "cursos"]
  ]);

  const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);
  const SEPARADOR = /\s+[-–—]\s+/;

  /** @param {string} linha */
  const secaoDe = (linha) => (linha.length <= 45 ? CABECALHOS.get(normalizar(linha).replace(/:$/, "")) : undefined);

  // Texto escrito em CAIXA ALTA vira "Caixa Alta" (só se o trecho for quase todo maiúsculo).
  /** @param {string} texto */
  const suavizar = (texto) => {
    const letras = texto.replace(/[^\p{L}]/gu, "");
    if (letras.length < 3) return texto;
    const maiusculas = letras.replace(/[^\p{Lu}]/gu, "").length;
    if (maiusculas / letras.length < 0.7) return texto;
    return texto.replace(/\p{L}+/gu, (palavra, indice) => {
      if (palavra.length < 2 || palavra !== palavra.toLocaleUpperCase("pt-BR")) return palavra;
      const minuscula = palavra.toLocaleLowerCase("pt-BR");
      return indice > 0 && MINUSCULAS.has(minuscula)
        ? minuscula
        : minuscula.charAt(0).toLocaleUpperCase("pt-BR") + minuscula.slice(1);
    });
  };

  /**
   * "Título - Instituição - UF (período)" -> partes.
   * @param {string} linha
   */
  const separarTituloEInstituicao = (linha) => {
    let texto = linha;
    let periodo = "";
    const final = /\(([^()]*)\)\s*$/.exec(texto);
    if (final && /\d{4}|previs/i.test(final[1])) {
      periodo = final[1].trim();
      texto = texto.slice(0, final.index).trim();
    }
    const [titulo = "", instituicao = ""] = texto.split(SEPARADOR);
    return { titulo: suavizar(titulo.trim()), instituicao: suavizar(instituicao.trim()), periodo };
  };

  /**
   * Procura o link de uma rede (linkedin, github) nos hiperlinks ou no texto.
   * @param {string} marca
   * @param {{ texto: string, url: string }[]} links
   * @param {string} texto
   */
  const acharLink = (marca, links, texto) => {
    const porLink = links.find((link) => normalizar(link.url).includes(marca));
    if (porLink) return porLink.url;
    const porTexto = new RegExp(`(?:https?://)?(?:www\\.)?${marca}\\.com/[^\\s|)]+`, "i").exec(texto);
    return porTexto ? porTexto[0] : "";
  };

  /**
   * @param {string[]} paragrafos
   * @param {{ texto: string, url: string }[]} [links]
   * @returns {CurriculoCompleto}
   */
  const interpretar = (paragrafos, links = []) => {
    /** @type {Record<string, string[]>} */
    const secoes = { cabecalho: [] };
    let atual = "cabecalho";
    for (const linha of paragrafos) {
      const secao = secaoDe(linha);
      if (secao) {
        atual = secao;
        secoes[atual] ??= [];
      } else {
        (secoes[atual] ??= []).push(linha);
      }
    }

    // Cabeçalho: nome na primeira linha; contatos nas seguintes, separados por "|".
    const topo = secoes.cabecalho;
    const textoTopo = topo.slice(1).join(" | ");
    const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(textoTopo)?.[0] ?? "";
    const semEmail = textoTopo.replace(email, " ");
    const telefone = /(?:\+?55[\s-]*)?\(?\d{2}\)?[\s-]*9?\d{4}[-\s]?\d{4}/.exec(semEmail)?.[0].trim() ?? "";
    let cidade = "";
    let estado = "";
    for (const parte of textoTopo.split("|").map((p) => p.trim())) {
      const local = /^([^\d@:]+?)\s*[-/,]\s*([A-Z]{2})$/.exec(parte);
      if (local) { cidade = local[1].trim(); estado = local[2]; break; }
    }

    /** @type {CurriculoCompleto["educacao"]} */
    const educacao = [];
    for (const linha of secoes.educacao ?? []) {
      const ultimo = educacao[educacao.length - 1];
      if (ultimo && /^[\p{L}][\p{L} ]{1,24}:\s/u.test(linha)) {
        ultimo.detalhes.push(linha);
      } else {
        const { titulo, instituicao, periodo } = separarTituloEInstituicao(linha);
        educacao.push({ curso: titulo, instituicao, periodo, detalhes: [] });
      }
    }

    /** @type {CurriculoCompleto["experiencias"]} */
    const experiencias = [];
    for (const linha of secoes.experiencia ?? []) {
      const ultima = experiencias[experiencias.length - 1];
      if (ultima && !linha.includes(" | ")) {
        ultima.descricao = `${ultima.descricao} ${linha}`.trim();
        continue;
      }
      const [esquerda = "", periodo = ""] = linha.split(/\s+\|\s+/);
      const [cargo = "", empresa = ""] = esquerda.split(SEPARADOR);
      const [inicio = "", fim = ""] = periodo.split(/\s+(?:[-–—]|a|até)\s+/i);
      experiencias.push({
        cargo: cargo.trim(),
        empresa: empresa.trim(),
        inicio: inicio.trim(),
        fim: fim.trim(),
        atual: /atual|presente|hoje/i.test(fim),
        descricao: ""
      });
    }

    const projetos = (secoes.projetos ?? []).map((linha) => {
      const corte = linha.indexOf(": ");
      return corte > 0 && corte <= 80
        ? { nome: linha.slice(0, corte).trim(), descricao: linha.slice(corte + 2).trim() }
        : { nome: linha, descricao: "" };
    });

    /** @type {string[]} */
    const textoHabilidades = [];
    /** @type {string[]} */
    const textoIdiomas = [...(secoes.idiomas ?? [])];
    for (const linha of secoes.habilidades ?? []) {
      const rotulo = /^([^:]{2,30}):\s*(.+)$/.exec(linha);
      if (rotulo && normalizar(rotulo[1]) === "idiomas") textoIdiomas.push(rotulo[2]);
      else textoHabilidades.push(rotulo ? rotulo[2] : linha);
    }
    const habilidades = textoHabilidades
      .join(", ")
      .split(/[,;]\s*/)
      .map((item) => item.replace(/\.$/, "").trim())
      .filter(Boolean);
    const idiomas = textoIdiomas
      .join(";")
      .split(";")
      .map((item) => item.replace(/\.$/, "").trim())
      .filter(Boolean)
      .map((item) => {
        const partes = /^(.*?)\s*\(([^)]*)\)/.exec(item);
        return partes
          ? { idioma: partes[1].trim(), nivel: (partes[2].split(SEPARADOR)[0] ?? "").trim() }
          : { idioma: item, nivel: "" };
      });

    return {
      nome: suavizar(topo[0] ?? ""),
      email,
      telefone,
      cidade,
      estado,
      linkedin: acharLink("linkedin", links, textoTopo),
      github: acharLink("github", links, textoTopo),
      objetivo: (secoes.objetivo ?? []).join(" "),
      resumo: (secoes.resumo ?? []).join(" "),
      educacao,
      experiencias,
      projetos,
      habilidades,
      idiomas,
      cursos: secoes.cursos ?? []
    };
  };

  // ---------- 3. Dados que a extensão sabe Preencher ----------

  /** @param {CurriculoCompleto} completo */
  const paraCampos = (completo) => {
    const formacao = completo.educacao[0];
    const experiencia = completo.experiencias[0];
    /** @type {Record<string, string>} */
    const campos = {
      nome: completo.nome,
      email: completo.email,
      telefone: completo.telefone,
      linkedin: completo.linkedin,
      portfolio: completo.github,
      cidade: completo.cidade,
      objetivo: completo.objetivo,
      resumo: completo.resumo,
      curso: formacao?.curso ?? "",
      instituicao: formacao?.instituicao ?? "",
      cargo: experiencia?.cargo ?? "",
      empresa: experiencia?.empresa ?? "",
      habilidades: completo.habilidades.join(", "),
      idiomas: completo.idiomas.map((i) => (i.nivel ? `${i.idioma} (${i.nivel})` : i.idioma)).join(", ")
    };
    for (const chave of Object.keys(campos)) if (!campos[chave]) delete campos[chave];
    return campos;
  };

  /** @param {ArrayBuffer} buffer */
  const importar = async (buffer) => {
    const { paragrafos, links } = await lerDocx(buffer);
    if (paragrafos.length === 0) throw new Error("O arquivo está vazio ou só tem imagens. Preciso de um currículo em texto.");
    const completo = interpretar(paragrafos, links);
    return { completo, campos: paraCampos(completo) };
  };

  globalThis.ImportarDocx = { importar, lerDocx, interpretar, paraCampos };
})();
