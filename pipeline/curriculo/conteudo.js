// Conteúdo do Currículo Sob Medida (CV3 a CV6, P12), 100% determinístico. Só REORDENA, AGRUPA e PRIORIZA o que já está no Perfil:
// nenhum fato é inventado. A vaga entra apenas como lista de palavras para comparar com o Perfil (dado, nunca instrução).
const { normalizar, acharTermo } = require("../radar/texto");

const MAX_EXPERIENCIAS = 6;
const MAX_PROJETOS = 4;
const MAX_TOPICOS = 4;
const MAX_HABILIDADES_NO_RESUMO = 4;
const MAX_HABILIDADES_NA_HEADLINE = 4;

// Termos técnicos comuns, para dizer o que a vaga pede e o Perfil não tem (lacunas). Só informa; nunca entra no PDF.
const TERMOS_TECNICOS = [
  "javascript", "typescript", "react", "react native", "next.js", "vue", "angular", "node", "node.js", "express", "nestjs", "python", "django", "flask", "fastapi",
  "java", "spring", "kotlin", "swift", "golang", "rust", "php", "laravel", "ruby", "rails", "c#", ".net", "c++", "html", "css", "sass", "tailwind",
  "sql", "mysql", "postgresql", "postgres", "mongodb", "redis", "oracle", "sqlite", "firebase", "graphql", "api", "docker", "kubernetes",
  "aws", "azure", "gcp", "linux", "git", "github", "gitlab", "ci/cd", "jenkins", "terraform", "devops", "scrum", "kanban", "jest", "cypress", "selenium",
  "playwright", "figma", "power bi", "excel", "pandas", "numpy", "machine learning", "llm", "ia generativa", "prompt engineering", "claude code", "copilot", "cursor"
];

// Grafias equivalentes: "Node" na vaga e "Node.js" no Perfil são a mesma coisa. Termos já normalizados.
const EQUIVALENTES = [
  ["node", "node.js", "nodejs"], ["react", "react.js", "reactjs"], ["vue", "vue.js", "vuejs"], ["next.js", "nextjs"],
  ["express", "express.js", "expressjs"], ["postgres", "postgresql"], ["mongodb", "mongo"], ["c#", "csharp"], ["golang"]
];

// Categorias da seção Habilidades. Termos já normalizados; o que não cabe em nenhuma é cortado nas vagas de desenvolvimento.
const CATEGORIAS = [
  { rotulo: "Linguagens", termos: ["javascript", "typescript", "python", "java", "c", "c++", "c#", "php", "go", "golang", "rust", "kotlin", "swift", "ruby", "bash", "shell"] },
  { rotulo: "Back-End & APIs", termos: ["node", "node.js", "nodejs", "express", "nestjs", "django", "flask", "fastapi", "spring", "laravel", "rails", ".net", "apis rest", "api rest", "apis", "api", "rest", "restful", "graphql"] },
  { rotulo: "Front-End", termos: ["html", "css", "react", "react native", "next.js", "vue", "angular", "sass", "tailwind"] },
  { rotulo: "Banco de Dados", termos: ["sql", "mysql", "postgresql", "postgres", "mongodb", "redis", "sqlite", "oracle", "firebase"] },
  { rotulo: "Automação & Ferramentas", termos: ["git", "github", "gitlab", "docker", "kubernetes", "linux", "playwright", "selenium", "google sheets api", "jest", "cypress", "ci/cd", "aws", "azure", "gcp", "postman", "figma", "terraform", "jenkins"] }
];

// Ordem das categorias conforme o foco da vaga.
const ORDEM_POR_FOCO = {
  "front-end": ["Linguagens", "Front-End", "Back-End & APIs", "Banco de Dados", "Automação & Ferramentas"],
  padrao: ["Linguagens", "Back-End & APIs", "Banco de Dados", "Automação & Ferramentas", "Front-End"]
};

const AREAS = [
  { chave: "back-end", rotulo: "Back-End", termos: ["back-end", "backend", "back end"] },
  { chave: "front-end", rotulo: "Front-End", termos: ["front-end", "frontend", "front end"] },
  { chave: "full-stack", rotulo: "Full-Stack", termos: ["full-stack", "fullstack", "full stack"] }
];
const SINAIS_DE_DESENVOLVIMENTO = ["desenvolv", "developer", "dev", "programador", "engenheir", "software", "back-end", "backend", "front-end", "frontend", "full-stack", "fullstack", "full stack", "sistemas", "analista de ti", "analista de sistemas"];

/** Todas as grafias equivalentes ao termo (inclui ele mesmo). @param {string} termoNormalizado */
const grafias = (termoNormalizado) => EQUIVALENTES.find((g) => g.includes(termoNormalizado)) || [termoNormalizado];

/** @param {any} e */
const textoDoItem = (e) => [e.titulo, e.organizacao, ...e.descricao, ...e.tecnologias].filter(Boolean).join(" ");

/** @param {string} texto @param {string} termo */
const cita = (texto, termo) => Boolean(acharTermo(texto, [normalizar(termo)]));

/** Lista em português: "A, B e C". @param {string[]} itens */
const listaEmPortugues = (itens) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);

/**
 * Palavras-chave técnicas da vaga que existem no Perfil (casadas) e que a vaga pede mas o Perfil não tem (lacunas).
 * @param {any} perfil @param {string} textoDaVaga
 */
function palavrasChave(perfil, textoDaVaga) {
  const vaga = normalizar(textoDaVaga);
  const doPerfil = new Map();
  for (const h of [...perfil.habilidades.tecnicas, ...perfil.habilidades.ferramentas, ...perfil.experiencias.flatMap((/** @type {any} */ e) => e.tecnologias)]) {
    if (!doPerfil.has(normalizar(h))) doPerfil.set(normalizar(h), h);
  }
  const casadas = [...doPerfil.entries()].filter(([chave]) => grafias(chave).some((g) => cita(vaga, g))).map(([, original]) => original);
  // Lacuna: a vaga pede, e nenhuma grafia equivalente está no Perfil. Uma por grupo de grafias.
  const doPerfilNorm = new Set([...doPerfil.keys()].flatMap(grafias));
  const lacunas = TERMOS_TECNICOS.filter((t) => cita(vaga, t) && !grafias(t).some((g) => doPerfilNorm.has(g)));
  const porGrupo = new Map(lacunas.map((t) => [grafias(t)[0], t]));
  return { casadas, lacunas: [...porGrupo.values()] };
}

/** @param {string} habilidade @returns {string | null} rótulo da categoria */
function categoriaDe(habilidade) {
  const n = normalizar(habilidade).trim();
  return CATEGORIAS.find((c) => c.termos.includes(n))?.rotulo || null;
}

/**
 * Foco da vaga lido do título e da descrição: área (back-end, front-end, full-stack), nível e se é vaga de desenvolvimento.
 * @param {{ titulo: string, descricao?: string }} vaga
 */
function focoDaVaga(vaga) {
  const titulo = normalizar(vaga.titulo);
  const texto = `${titulo} ${normalizar(vaga.descricao || "")}`;
  const area = AREAS.find((a) => a.termos.some((t) => titulo.includes(t))) || AREAS.find((a) => a.termos.some((t) => texto.includes(t))) || null;
  const nivel = /\b(estagi|estagiari)/.test(titulo) ? "estagio" : /\b(junior|jr)\b/.test(titulo) ? "junior" : null;
  const desenvolvimento = Boolean(area) || SINAIS_DE_DESENVOLVIMENTO.some((s) => (s.length <= 3 ? new RegExp(`\\b${s}\\b`).test(titulo) : titulo.includes(s)));
  return { area, nivel, desenvolvimento };
}

/**
 * Agrupa as habilidades do Perfil por categoria. Em vaga de desenvolvimento, o que não é tecnologia de software
 * (ex.: "manutenção de aparelhos celulares") fica de fora; nas demais vagas vai para "Outras".
 * @param {string[]} habilidades já em ordem de prioridade @param {{ area: any, desenvolvimento: boolean }} foco
 */
function agruparHabilidades(habilidades, foco) {
  /** @type {Map<string, string[]>} */
  const porRotulo = new Map();
  for (const h of habilidades) {
    const rotulo = categoriaDe(h) || (foco.desenvolvimento ? null : "Outras");
    if (!rotulo) continue;
    porRotulo.set(rotulo, [...(porRotulo.get(rotulo) || []), h]);
  }
  const ordem = [...(ORDEM_POR_FOCO[/** @type {"front-end"} */ (foco.area?.chave)] || ORDEM_POR_FOCO.padrao), "Outras"];
  return ordem.filter((r) => porRotulo.has(r)).map((rotulo) => ({ rotulo, itens: porRotulo.get(rotulo) || [] }));
}

/**
 * Headline logo abaixo do nome: cargo no foco da vaga + as principais tecnologias do Perfil. Sem foco claro, só as tecnologias.
 * @param {any[]} categorias @param {ReturnType<typeof focoDaVaga>} foco @param {string[]} [alinhadas] habilidades que a vaga também pede (vêm primeiro)
 */
function montarHeadline(categorias, foco, alinhadas = []) {
  const candidatas = categorias
    .filter((c) => ["Linguagens", "Back-End & APIs", "Front-End"].includes(c.rotulo))
    .flatMap((c) => c.itens);
  const principais = [...candidatas.filter((h) => alinhadas.includes(h)), ...candidatas.filter((h) => !alinhadas.includes(h) && !/^c(\+\+)?$/i.test(h))].slice(0, MAX_HABILIDADES_NA_HEADLINE); // C e C++ só entram se a vaga os pedir
  const cargo = foco.desenvolvimento
    ? foco.nivel === "estagio"
      ? `Estágio em Desenvolvimento${foco.area ? ` ${foco.area.rotulo}` : " de Software"}`
      : `Desenvolvedora ${foco.area ? foco.area.rotulo : "de Software"}${foco.nivel === "junior" ? " Júnior" : ""}`
    : null;
  return [cargo, principais.join(" • ")].filter(Boolean).join(" | ") || null;
}

/**
 * Resumo em parágrafo corrido, só com fatos do Perfil: formação, foco técnico alinhado à vaga e o item de maior destaque.
 * @param {any} perfil @param {string[]} destaques habilidades do Perfil alinhadas à vaga
 * @param {any | null} melhor item mais alinhado @param {ReturnType<typeof focoDaVaga>} [foco]
 */
function montarResumo(perfil, destaques, melhor, foco) {
  const frases = [];
  const f = perfil.formacao[0];
  if (f) {
    const curso = [f.grau, f.curso].filter(Boolean).join(" em ");
    const instituicao = [f.instituicao, f.sigla && `(${f.sigla})`].filter(Boolean).join(" ");
    const cursando = Boolean(f.previsaoConclusao) || /andamento|cursando|curso|atual/i.test(f.status || "");
    const base = [curso, instituicao && (curso ? `na ${instituicao}`.replace(/^na (Instituto|Centro|Col[eé]gio)/, "no $1") : instituicao)].filter(Boolean).join(" ");
    if (base) frases.push(`${cursando ? "Cursando " : ""}${base}${f.previsaoConclusao ? `, com previsão de conclusão em ${f.previsaoConclusao}` : ""}.`);
  }
  const habilidades = (destaques.length > 0 ? destaques : [...perfil.habilidades.tecnicas, ...perfil.habilidades.ferramentas]).slice(0, MAX_HABILIDADES_NO_RESUMO);
  if (habilidades.length > 0) {
    const area = foco?.area && destaques.length > 0 ? ` em desenvolvimento ${foco.area.rotulo.toLowerCase()}` : "";
    frases.push(`Foco técnico${area} com ${listaEmPortugues(habilidades)}.`);
  }
  if (melhor?.titulo) {
    const tecnologias = melhor.tipo === "projeto" ? melhor.organizacao : null;
    const org = melhor.tipo === "projeto" ? null : String(melhor.organizacao || "").split(" - ")[0].trim(); // só o nome da organização, sem a cadeia de siglas
    frases.push(melhor.tipo === "projeto"
      ? `Desenvolvi o projeto ${melhor.titulo}${tecnologias ? ` (${tecnologias})` : ""}.`
      : `Atuei como ${melhor.titulo}${org ? ` (${org})` : ""}.`);
  }
  return frases.join(" ");
}

/**
 * Monta o conteúdo do currículo para uma vaga. Função pura.
 * @param {{ perfil: any, vaga: { titulo: string, empresa?: string, descricao?: string } }} args
 */
function montarConteudo({ perfil, vaga }) {
  const textoDaVaga = `${vaga.titulo}\n${vaga.descricao || ""}`;
  const foco = focoDaVaga(vaga);
  const { casadas, lacunas } = palavrasChave(perfil, textoDaVaga);
  const chaves = casadas.map(normalizar);
  const pontos = (/** @type {string} */ texto) => {
    const t = normalizar(texto);
    return chaves.filter((c) => grafias(c).some((g) => cita(t, g))).length;
  };
  // Item "de tecnologia": cita alguma tecnologia de software (as categorias ou os termos técnicos comuns).
  const termosDeSoftware = [...new Set([...CATEGORIAS.flatMap((c) => c.termos), ...TERMOS_TECNICOS])].filter((t) => !["api", "c", "go", "cursor", "excel", "figma"].includes(t));
  const ehTecnologia = (/** @type {any} */ item) => {
    const t = normalizar(textoDoItem(item));
    return termosDeSoftware.some((termo) => cita(t, termo));
  };

  // Itens por interseção com a vaga (maior primeiro); empate mantém a ordem do Perfil. Tópicos idem.
  const ordenados = perfil.experiencias
    .map((/** @type {any} */ item, /** @type {number} */ i) => ({ item, i, pontos: pontos(textoDoItem(item)), tecnologia: ehTecnologia(item) }))
    .sort((/** @type {any} */ a, /** @type {any} */ b) => b.pontos - a.pontos || a.i - b.i)
    .map((/** @type {any} */ { item, pontos: p, tecnologia }) => {
      // Vaga de desenvolvimento: experiência sem tecnologia vira uma linha só (cargo, organização, período), sem tópicos.
      const resumida = foco.desenvolvimento && !tecnologia && item.tipo !== "projeto";
      return {
        item,
        pontos: p,
        tecnologia,
        resumida,
        topicos: resumida ? [] : item.descricao
          .map((/** @type {string} */ t, /** @type {number} */ i) => ({ t, i, p: pontos(t) }))
          .sort((/** @type {any} */ a, /** @type {any} */ b) => b.p - a.p || a.i - b.i)
          .slice(0, MAX_TOPICOS)
          .map((/** @type {any} */ x) => x.t)
      };
    });

  // Habilidades: as da vaga primeiro (na ordem em que o Perfil as lista), depois as demais, para o ATS ver o conjunto completo.
  const doPerfil = [...perfil.habilidades.tecnicas, ...perfil.habilidades.ferramentas];
  const alinhadas = doPerfil.filter((h) => chaves.includes(normalizar(h)));
  const ordemDeHabilidades = [...alinhadas, ...doPerfil.filter((h) => !alinhadas.includes(h))];
  const categorias = agruparHabilidades(ordemDeHabilidades, foco);
  const habilidades = categorias.flatMap((c) => c.itens);

  const tecnicas = ordenados.filter((/** @type {any} */ e) => e.item.tipo !== "projeto" && !e.resumida);
  const resumidas = ordenados.filter((/** @type {any} */ e) => e.resumida);
  const experiencias = [...tecnicas, ...resumidas];
  const projetos = ordenados.filter((/** @type {any} */ e) => e.item.tipo === "projeto");
  const melhor = ordenados.find((/** @type {any} */ e) => e.pontos > 0 && (e.tecnologia || !foco.desenvolvimento))?.item || null;

  /** @type {string[]} */
  const avisos = [];
  if (lacunas.length > 0) avisos.push(`A vaga pede ${lacunas.join(", ")}, que não está no Perfil: não incluí.`);
  if (casadas.length === 0) avisos.push("Nenhuma palavra-chave técnica da vaga bate com o Perfil: mantive a ordem original.");

  return {
    cv: {
      identificacao: perfil.identificacao,
      headline: montarHeadline(categorias, foco, alinhadas),
      resumo: montarResumo(perfil, alinhadas, melhor, foco) || null,
      experiencias: experiencias.slice(0, MAX_EXPERIENCIAS),
      projetos: projetos.slice(0, MAX_PROJETOS),
      formacao: perfil.formacao,
      habilidades,
      categorias,
      idiomas: perfil.habilidades.idiomas
    },
    avisos,
    palavrasChave: { casadas, lacunas }
  };
}

module.exports = { montarConteudo, palavrasChave, montarResumo, montarHeadline, focoDaVaga, agruparHabilidades, TERMOS_TECNICOS };
