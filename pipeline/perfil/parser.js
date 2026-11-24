// Parser determinístico do Currículo Base (modo sem LLM): divide o texto do Doc por títulos de seção e lê listas,
// períodos, contatos e hiperlinks por regra. Todo valor devolvido é um trecho do próprio texto (Ancoragem por construção).
const { normalizar, acharTermo } = require("../radar/texto");
const { REGIOES_DF } = require("../radar/locais");
const { extrairDeterministico } = require("./regras");
const { dataJaPassou } = require("./datas");

const TITULOS_DE_SECAO = {
  formacao: ["formacao", "formacao academica", "educacao", "escolaridade", "academico", "formacao e cursos"],
  experiencia: ["experiencia", "experiencias", "experiencia profissional", "experiencias profissionais", "historico profissional", "experiencia de trabalho", "estagios"],
  projetos: ["projetos", "projeto", "projetos pessoais", "projetos academicos", "projetos de destaque"],
  habilidades: ["habilidades", "habilidades tecnicas", "competencias", "competencias tecnicas", "skills", "tecnologias", "conhecimentos", "conhecimentos tecnicos", "stack",
    "ferramentas", "ferramentas e tecnologias", "linguagens", "linguagens e frameworks"],
  idiomas: ["idiomas", "linguas"],
  // Seções que o Pipeline não usa: reconhecer o título evita que as linhas dela caiam na seção anterior (ex.: Idiomas).
  ignorar: ["resumo", "resumo profissional", "objetivo", "sobre", "sobre mim", "perfil", "perfil profissional", "contato", "contatos", "dados pessoais",
    "cursos", "certificacoes", "certificados", "cursos e certificacoes", "certificacoes e cursos", "licencas e certificacoes", "cursos complementares",
    "formacao complementar", "atividades extracurriculares", "atividades", "voluntariado", "referencias", "premios", "conquistas", "premios e conquistas",
    "soft skills", "habilidades comportamentais", "competencias comportamentais", "links", "redes sociais", "interesses", "hobbies", "publicacoes", "portfolio"]
};

const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
const BULLET = /^\s*(?:[-•*·▪●○◦–—]|\d+[.)])\s+/;
const MES = "(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\\.?(?:\\s+de)?\\s*\\/?\\s*\\d{4}";
const DATA = `(?:\\d{1,2}\\/\\d{4}|${MES}|\\d{4})`;
const FIM = `(?:${DATA}|atual(?:mente)?|presente|hoje|em andamento|cursando)`;
const PERIODO_FAIXA = new RegExp(`${DATA}\\s*(?:[-–—]|\\s(?:a|até|ate)\\s)\\s*${FIM}`, "i");
const PERIODO_UNICO = new RegExp(`\\b${DATA}\\b`, "i");
const GRAU = /\b(licenciatura|bacharelado|bacharel|tecnologia|tecn[oó]logo|t[eé]cnico|p[oó]s-gradua[cç][aã]o|especializa[cç][aã]o|mba|mestrado|doutorado|gradua[cç][aã]o)\b/i;
const INSTITUICAO = /\b(universidade|faculdade|instituto|centro universit[aá]rio|escola|col[eé]gio|unb|ifb|ifg|uniceub|iesb|ucb|puc|usp|unicamp)\b/i;
const STATUS = /\b(cursando|em andamento|em curso|conclu[ií]d[oa]|completo|incompleto|trancado)\b/i;
const PREVISAO = /previs[aã]o(?:\s+de)?(?:\s+(?:conclus[aã]o|formatura|t[eé]rmino))?\s*:?\s*(?:para\s+)?([^,;|()]+?)(?=[,;|()]|$)/i;
const SEPARADOR = /\s+[|–—-]\s+|\s*\|\s*|\s{2,}|[()]/;

/** @param {string} linha */
function tituloDeSecao(linha) {
  const n = normalizar(linha).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (!n || n.length > 45 || BULLET.test(linha)) return null;
  for (const [secao, titulos] of Object.entries(TITULOS_DE_SECAO)) if (titulos.includes(n)) return secao;
  return null;
}

/** @param {string} linha */
const semMarcador = (linha) => linha.replace(BULLET, "").trim();

/**
 * Divide em vírgula, ponto e vírgula, barra vertical e marcadores, mas só FORA de parênteses:
 * "Inglês (avançado, certificado); Espanhol" vira dois itens, não três.
 * @param {string} valor
 */
function dividirLista(valor) {
  /** @type {string[]} */
  const itens = [];
  let atual = "";
  let nivel = 0;
  for (const c of valor) {
    if (c === "(") nivel += 1;
    else if (c === ")") nivel = Math.max(0, nivel - 1);
    if (nivel === 0 && ",;|•·".includes(c)) {
      itens.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  itens.push(atual);
  return itens.map((s) => s.trim().replace(/\.$/, "")).filter((s) => s.length > 0 && s.length <= 70);
}

/** Separa "Rótulo: a, b, c" em rótulo e lista. @param {string} linha */
function rotuloELista(linha) {
  const m = /^([^:]{2,40}):\s*(.+)$/.exec(linha);
  const rotulo = m ? normalizar(m[1]) : "";
  const valor = m ? m[2] : linha;
  return { rotulo, itens: dividirLista(valor) };
}

const ROTULOS_DE_LINK = /^(reposit[óo]rio|mat[ée]ria|not[ií]cia|reportagem|imprensa|demo|demonstra[cç][aã]o|site|link|deploy|publica[cç][aã]o|artigo|v[ií]deo|portf[óo]lio|c[óo]digo)\s*:\s*(.+)$/i;
// Domínio + caminho. Aceita espaço dentro do caminho (o Doc às vezes quebra o link); ele é removido ao montar a URL.
const DOMINIO_E_CAMINHO = /^(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+(?:\/.*)?$/;

/**
 * "Repositório: github.com/Usuario/Repo" ou "Matéria: veiculo.com/titulo (https://www.veiculo.com/titulo)" é um LINK do item,
 * não uma frase de descrição. Devolve o rótulo como está no Doc e a URL completa, sem espaços.
 * @param {string} linha
 * @returns {{ rotulo: string, url: string } | null}
 */
function lerLinkRotulado(linha) {
  const m = ROTULOS_DE_LINK.exec(semMarcador(linha).trim());
  if (!m) return null;
  const resto = m[2].trim();
  const entreParenteses = /\((https?:\/\/[^\s)]+)\)\s*$/.exec(resto);
  const solto = DOMINIO_E_CAMINHO.test(resto) ? resto : null;
  const bruta = entreParenteses ? entreParenteses[1] : solto;
  if (!bruta) return null;
  const url = bruta.replace(/\s+/g, "").replace(/[.,;]+$/, ""); // URL exata: nunca com espaço no meio
  return { rotulo: m[1].charAt(0).toUpperCase() + m[1].slice(1), url: /^https?:\/\//i.test(url) ? url : `https://${url}` };
}

/** @param {string} linha @returns {{ periodo: string | null, resto: string, fim: string | null }} */
function tirarPeriodo(linha) {
  const faixa = PERIODO_FAIXA.exec(linha);
  const m = faixa || PERIODO_UNICO.exec(linha);
  if (!m) return { periodo: null, resto: linha, fim: null };
  const resto = linha.replace(m[0], " ").replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim();
  const fim = faixa ? /(?:[-–—]|\s(?:a|até|ate)\s)\s*(.+)$/i.exec(m[0])?.[1].trim() ?? null : null;
  return { periodo: m[0].trim(), resto, fim };
}

/** "Cargo - Empresa - 2024 - 2025" → título, organização e período. @param {string} linha */
function cabecalhoDoItem(linha) {
  const { periodo, resto } = tirarPeriodo(linha);
  const segmentos = resto.split(SEPARADOR).map((s) => s.trim().replace(/^[-–—|,]+|[-–—|,]+$/g, "").trim()).filter(Boolean);
  return { titulo: segmentos[0] || null, organizacao: segmentos.slice(1).join(" - ") || null, periodo };
}

/**
 * Linha que na verdade é o cabeçalho de um item (mesmo com marcador ou passando de 110 caracteres): "Título | tecnologia, tecnologia", curta, sem frase, e seguida de um tópico.
 * @param {string} linha @param {string} proxima próxima linha não vazia
 */
function pareceCabecalhoDeItem(linha, proxima) {
  const texto = semMarcador(linha);
  const partes = texto.split(/\s+\|\s+/);
  if (partes.length !== 2 || !BULLET.test(proxima)) return false;
  const [titulo, resto] = partes;
  if (titulo.length < 2 || titulo.length > 60 || /[.!?:;]/.test(titulo)) return false;
  return !/[.!?]$/.test(texto) && resto.split(",").length >= 2 && !lerLinkRotulado(linha);
}

/** @param {string[]} linhas @param {"experiencia" | "projeto"} tipo */
function parsearItens(linhas, tipo) {
  /** @type {{ tipo: "experiencia" | "projeto", titulo: string | null, organizacao: string | null, periodo: string | null, descricao: string[], tecnologias: string[], links: { rotulo: string, url: string }[] }[]} */
  const itens = [];
  /** @type {typeof itens[number] | null} */
  let atual = null;

  for (const [indice, bruta] of linhas.entries()) {
    const linha = bruta.trim();
    if (!linha) continue;
    const proxima = linhas.slice(indice + 1).find((l) => l.trim())?.trim() || "";
    const tecnologias = /^(?:tecnologias|stack|ferramentas|tecnologias utilizadas)\s*:\s*(.+)$/i.exec(semMarcador(linha));

    if (tecnologias && atual) {
      atual.tecnologias.push(...dividirLista(tecnologias[1]));
    } else if (atual && atual.descricao.length > 0 && pareceCabecalhoDeItem(linha, proxima)) {
      // "Projeto | Node.js, Playwright" (com ou sem marcador, até longo) colado como tópico do item anterior: é o cabeçalho de um item novo.
      const c = cabecalhoDoItem(semMarcador(linha));
      atual = { tipo, titulo: c.titulo, organizacao: c.organizacao, periodo: c.periodo, descricao: [], tecnologias: [], links: [] };
      itens.push(atual);
    } else if (BULLET.test(linha) && atual) {
      const link = lerLinkRotulado(linha);
      if (link) atual.links.push(link);
      else atual.descricao.push(semMarcador(linha));
    } else if (atual && (linha.length > 110 || /[.!?]$/.test(linha))) {
      atual.descricao.push(linha); // parágrafo solto sob o cabeçalho
    } else if (atual && atual.descricao.length === 0 && (!atual.organizacao || !atual.periodo)) {
      // segunda linha do cabeçalho ("Empresa | Jan 2024 - Dez 2024")
      const c = cabecalhoDoItem(linha);
      if (!atual.periodo && c.periodo) atual.periodo = c.periodo;
      const extra = [c.titulo, c.organizacao].filter(Boolean).join(" - ");
      if (extra && !atual.organizacao) atual.organizacao = extra;
    } else {
      const c = cabecalhoDoItem(linha);
      atual = { tipo, titulo: c.titulo, organizacao: c.organizacao, periodo: c.periodo, descricao: [], tecnologias: [], links: [] };
      itens.push(atual);
    }
  }
  return itens;
}

const GRAU_ESPECIFICO = /\b(licenciatura|bacharelado|bacharel|tecn[oó]logo|tecnologia)\b/i;

/**
 * Lê uma linha de formação. Devolve os campos e se a linha tem período (cada linha datada é uma formação própria).
 * @param {string} linha
 */
function lerLinhaDeFormacao(linha) {
  let texto = semMarcador(linha);
  /** @type {{ instituicao: string | null, curso: string | null, grau: string | null, sigla: string | null, status: string | null, previsaoConclusao: string | null }} */
  const f = { instituicao: null, curso: null, grau: null, sigla: null, status: null, previsaoConclusao: null };

  const prev = PREVISAO.exec(texto);
  if (prev) {
    f.previsaoConclusao = prev[1].trim();
    texto = texto.replace(prev[0], " ");
  }
  const st = STATUS.exec(texto);
  if (st) {
    f.status = st[1];
    texto = texto.replace(st[0], " ");
  }
  const { periodo, resto, fim } = tirarPeriodo(texto);
  if (periodo && fim) {
    // "Jul/2025 – Atual" = em andamento (texto do próprio Doc); "2025 - 2029" = previsão de término só se a data ainda não passou:
    // fim no passado é formação concluída e fica como data simples (sem rótulo "previsão", que o Doc não escreveu).
    if (/atual|presente|hoje|andamento|cursando/i.test(fim)) f.status = f.status || fim;
    else if (dataJaPassou(fim)) f.status = f.status || fim;
    else if (!f.previsaoConclusao) f.previsaoConclusao = fim;
  }
  texto = resto;

  // Parênteses: "(Licenciatura)" especifica o grau; "(UnB)" é a sigla da instituição; "(400h)" é detalhe e fica de fora.
  /** @type {string | null} */ let grauEspecifico = null;
  /** @type {string | null} */ let sigla = null;
  texto = texto.replace(/\(([^)]*)\)/g, (_, dentro) => {
    const d = String(dentro).trim();
    const g = GRAU_ESPECIFICO.exec(d);
    if (g) grauEspecifico = g[1].charAt(0).toUpperCase() + g[1].slice(1);
    else if (/^[A-Za-z]{2,8}$/.test(d) && (d.match(/[A-Z]/g) || []).length >= 2) sigla = d;
    return " ";
  });

  /** @type {string[]} */ const sobras = [];
  for (const segmento of texto.split(SEPARADOR).map((s) => s.trim().replace(/^[-–—|,:]+|[-–—|,:]+$/g, "").trim()).filter(Boolean)) {
    const g = GRAU.exec(segmento);
    if (g && !f.grau) {
      f.grau = g[1].charAt(0).toUpperCase() + g[1].slice(1);
      const depois = segmento.slice(g.index + g[0].length).replace(/^\s*(?:em|de|da|do)\s+/i, "").trim();
      if (depois && !f.curso) f.curso = depois;
    } else if (INSTITUICAO.test(segmento)) {
      if (!f.instituicao) f.instituicao = segmento;
    } else if (!f.curso) {
      f.curso = segmento;
    } else {
      sobras.push(segmento);
    }
  }
  if (grauEspecifico) f.grau = grauEspecifico;
  // "Curso – Instituição | período": o segmento que sobrou depois do curso é a instituição, mesmo sem a palavra "Universidade".
  if (!f.instituicao) f.instituicao = sobras[0] || sigla;
  if (sigla && sigla !== f.instituicao) f.sigla = sigla;
  return { f, periodo: Boolean(periodo) };
}

/** @param {string} linha */
const parsearLinhaDeFormacao = (linha) => lerLinhaDeFormacao(linha).f;

/** @param {string[]} linhas */
function parsearFormacao(linhas) {
  /** @type {{ f: ReturnType<typeof parsearLinhaDeFormacao>, periodo: boolean }[]} */
  const formacoes = [];
  for (const linha of linhas) {
    if (!linha.trim() || BULLET.test(linha)) continue; // tópicos sob uma formação são detalhe, não outra formação
    const { f: p, periodo } = lerLinhaDeFormacao(linha);
    const atual = formacoes[formacoes.length - 1];
    const completa = Boolean(atual && atual.f.curso && atual.f.instituicao);
    const temIdentidade = Boolean(p.grau || p.curso || p.instituicao);
    // Nova formação: a anterior já está completa, ou a linha traz outro grau, ou outra linha datada.
    const nova = !atual || (completa && temIdentidade) || Boolean(p.grau && atual.f.grau) || Boolean(periodo && atual.periodo);
    if (nova) {
      formacoes.push({ f: p, periodo });
    } else {
      for (const campo of /** @type {(keyof typeof p)[]} */ (Object.keys(p))) if (p[campo] && !atual.f[campo]) atual.f[campo] = p[campo];
      atual.periodo = atual.periodo || periodo;
    }
  }
  return formacoes.map((x) => x.f).filter((f) => f.instituicao || f.curso);
}

/** @param {string[]} linhasHabilidades @param {string[]} linhasIdiomas */
function parsearHabilidades(linhasHabilidades, linhasIdiomas) {
  /** @type {string[]} */ const tecnicas = [];
  /** @type {string[]} */ const ferramentas = [];
  /** @type {string[]} */ const idiomas = [];
  const juntar = (/** @type {string[]} */ alvo, /** @type {string[]} */ novos) => { for (const n of novos) if (!alvo.includes(n)) alvo.push(n); };

  for (const bruta of linhasHabilidades) {
    const linha = semMarcador(bruta);
    if (!linha) continue;
    const { rotulo, itens } = rotuloELista(linha);
    if (/^idiomas?\b|^linguas?$/.test(rotulo)) {
      juntar(idiomas, itens); // "Linguagens" (de programação) não é idioma
      continue;
    }
    if (/ferrament/.test(rotulo)) juntar(ferramentas, itens);
    else juntar(tecnicas, itens);
  }
  for (const bruta of linhasIdiomas) {
    const linha = semMarcador(bruta);
    if (linha) juntar(idiomas, rotuloELista(linha).itens);
  }
  return { tecnicas, ferramentas, idiomas };
}

/** @param {string[]} linhasDoCabecalho @param {string} texto */
function parsearIdentificacao(linhasDoCabecalho, texto) {
  const det = extrairDeterministico(texto);
  const cabecalho = linhasDoCabecalho.join("\n");
  const ehContato = (/** @type {string} */ l) => /@|https?:\/\/|linkedin|github|\d{4}[\s-]?\d{4}/i.test(l);
  const nome = linhasDoCabecalho.map((l) => l.trim()).find((l) => l && !ehContato(l) && l.length <= 70) || null;

  const segmentos = linhasDoCabecalho.flatMap((l) => l.split(/\s[|•·]\s/)).map((s) => s.trim());
  let cidade = null;
  let estado = null;
  for (const s of segmentos.concat(linhasDoCabecalho.map((l) => l.trim()))) {
    const m = /^([A-ZÀ-Ý][\p{L}' ]{1,40}?)\s*[-–,/]\s*([A-Z]{2})$/u.exec(s);
    if (m && UFS.has(m[2])) { cidade = m[1].trim(); estado = m[2]; break; }
  }
  const textoCab = normalizar(cabecalho);
  const regiao = REGIOES_DF.find((ra) => acharTermo(textoCab, [normalizar(ra)])) || null;

  // Portfólio: só URLs do cabeçalho (links de matéria ou repositório dentro de projetos pertencem ao projeto).
  const urls = [...cabecalho.matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0].replace(/[.,;]+$/, ""));
  const portfolio = urls.find((u) => !/linkedin\.com|github\.com|docs\.google\.com|mailto:/i.test(u)) || null;

  return {
    nome, email: det.email, telefone: det.telefone, cidade, estado, regiaoAdministrativa: regiao,
    linkedin: det.linkedin, github: det.github, portfolio
  };
}

/**
 * @param {string} texto Texto do Currículo Base (de lerTextoDoc)
 * @returns {{ perfil: import("zod").infer<typeof import("./schema").PerfilSchema>, avisos: string[] }}
 */
function parsearPerfil(texto) {
  const linhas = String(texto || "").split("\n");
  /** @type {Record<string, string[]>} */
  const secoes = { cabecalho: [], formacao: [], experiencia: [], projetos: [], habilidades: [], idiomas: [], ignorar: [] };
  let atual = "cabecalho";
  let achouSecao = false;
  /** @type {Set<string>} */
  const vistas = new Set();

  for (const linha of linhas) {
    const secao = tituloDeSecao(linha);
    // Título desconhecido TODO EM MAIÚSCULAS dentro de Idiomas ou Habilidades encerra a seção, em vez de virar item dela.
    if (!secao && (atual === "idiomas" || atual === "habilidades") && /^[A-ZÀ-Ý][A-ZÀ-Ý &/]{4,40}$/.test(linha.trim())) {
      atual = "ignorar";
      continue;
    }
    if (secao) {
      atual = secao;
      achouSecao = true;
      vistas.add(secao);
      continue;
    }
    secoes[atual].push(linha);
  }
  if (!achouSecao) {
    throw new Error("Não reconheci nenhuma seção no Currículo Base. Use títulos como Formação, Experiência, Projetos e Habilidades, cada um em uma linha.");
  }

  const identificacao = parsearIdentificacao(secoes.cabecalho, linhas.join("\n"));
  if (!identificacao.nome) throw new Error("Não achei o nome na primeira linha do Currículo Base.");

  const habilidades = parsearHabilidades(secoes.habilidades, secoes.idiomas);
  const todas = [...habilidades.tecnicas, ...habilidades.ferramentas];
  const experiencias = [...parsearItens(secoes.experiencia, "experiencia"), ...parsearItens(secoes.projetos, "projeto")]
    .filter((e) => e.titulo || e.organizacao)
    .map((e) => {
      // Tecnologias do item: as declaradas e as habilidades do Doc que o próprio item cita.
      const textoDoItem = normalizar([e.titulo, ...e.descricao].join(" "));
      const citadas = todas.filter((h) => acharTermo(textoDoItem, [normalizar(h)]));
      return { ...e, tecnologias: [...new Set([...e.tecnologias, ...citadas])] };
    });

  /** @type {string[]} */
  const avisos = [];
  for (const [chave, rotulo] of [["formacao", "Formação"], ["experiencia", "Experiência"], ["projetos", "Projetos"], ["habilidades", "Habilidades"]]) {
    if (!vistas.has(chave)) avisos.push(`Não achei a seção ${rotulo} no Currículo Base.`);
  }

  const perfil = { identificacao, formacao: parsearFormacao(secoes.formacao), experiencias, habilidades };
  if (perfil.formacao.length === 0 && perfil.experiencias.length === 0 && todas.length === 0) {
    throw new Error("Reconheci os títulos, mas não consegui ler nenhum item de Formação, Experiência, Projetos ou Habilidades.");
  }
  return { perfil, avisos };
}

module.exports = { parsearPerfil, tituloDeSecao, cabecalhoDoItem, parsearLinhaDeFormacao, tirarPeriodo };
