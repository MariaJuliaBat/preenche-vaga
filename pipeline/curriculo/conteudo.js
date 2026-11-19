// Conteúdo do Currículo Sob Medida (CV3 a CV6, P12), 100% determinístico. Só REORDENA e PRIORIZA o que já está no Perfil:
// nada é reescrito nem inventado. A vaga entra apenas como lista de palavras para comparar com o Perfil (dado, nunca instrução).
const { normalizar, acharTermo } = require("../radar/texto");

const MAX_EXPERIENCIAS = 4;
const MAX_PROJETOS = 3;
const MAX_TOPICOS = 4;
const MAX_HABILIDADES_NO_RESUMO = 6;

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

/** Todas as grafias equivalentes ao termo (inclui ele mesmo). @param {string} termoNormalizado */
const grafias = (termoNormalizado) => EQUIVALENTES.find((g) => g.includes(termoNormalizado)) || [termoNormalizado];

/** @param {any} e */
const textoDoItem = (e) => [e.titulo, e.organizacao, ...e.descricao, ...e.tecnologias].filter(Boolean).join(" ");

/** @param {string} texto @param {string} termo */
const cita = (texto, termo) => Boolean(acharTermo(texto, [normalizar(termo)]));

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

/**
 * Resumo só com fatos do Perfil: a formação e as habilidades que a vaga também pede.
 * @param {any} perfil @param {string[]} destaques habilidades do Perfil alinhadas à vaga
 * @param {{ titulo: string | null, organizacao: string | null } | null} melhor item mais alinhado
 */
function montarResumo(perfil, destaques, melhor) {
  const partes = [];
  const f = perfil.formacao[0];
  if (f) {
    const curso = [f.grau, f.curso].filter(Boolean).join(" em ");
    const detalhe = [f.instituicao, f.status, f.previsaoConclusao ? `previsão ${f.previsaoConclusao}` : null].filter(Boolean).join(", ");
    if (curso || detalhe) partes.push(`${[curso, detalhe && `(${detalhe})`].filter(Boolean).join(" ")}.`);
  }
  const habilidades = destaques.length > 0 ? destaques : [...perfil.habilidades.tecnicas, ...perfil.habilidades.ferramentas];
  if (habilidades.length > 0) {
    partes.push(`${destaques.length > 0 ? "Habilidades alinhadas à vaga" : "Habilidades"}: ${habilidades.slice(0, MAX_HABILIDADES_NO_RESUMO).join(", ")}.`);
  }
  if (melhor && destaques.length > 0) {
    const nome = [melhor.titulo, melhor.organizacao && `(${melhor.organizacao})`].filter(Boolean).join(" ");
    if (nome) partes.push(`Destaque: ${nome}.`);
  }
  return partes.join(" ");
}

/**
 * Monta o conteúdo do currículo para uma vaga. Função pura.
 * @param {{ perfil: any, vaga: { titulo: string, empresa?: string, descricao?: string } }} args
 */
function montarConteudo({ perfil, vaga }) {
  const textoDaVaga = `${vaga.titulo}\n${vaga.descricao || ""}`;
  const { casadas, lacunas } = palavrasChave(perfil, textoDaVaga);
  const chaves = casadas.map(normalizar);
  const pontos = (/** @type {string} */ texto) => {
    const t = normalizar(texto);
    return chaves.filter((c) => grafias(c).some((g) => cita(t, g))).length;
  };

  // Itens por interseção com a vaga (maior primeiro); empate mantém a ordem do Perfil. Tópicos idem.
  const ordenados = perfil.experiencias
    .map((/** @type {any} */ item, /** @type {number} */ i) => ({ item, i, pontos: pontos(textoDoItem(item)) }))
    .sort((/** @type {any} */ a, /** @type {any} */ b) => b.pontos - a.pontos || a.i - b.i)
    .map((/** @type {any} */ { item, pontos: p }) => ({
      item,
      pontos: p,
      topicos: item.descricao
        .map((/** @type {string} */ t, /** @type {number} */ i) => ({ t, i, p: pontos(t) }))
        .sort((/** @type {any} */ a, /** @type {any} */ b) => b.p - a.p || a.i - b.i)
        .slice(0, MAX_TOPICOS)
        .map((/** @type {any} */ x) => x.t)
    }));

  // Habilidades: as da vaga primeiro (na ordem em que o Perfil as lista), depois as demais, para o ATS ver o conjunto completo.
  const doPerfil = [...perfil.habilidades.tecnicas, ...perfil.habilidades.ferramentas];
  const alinhadas = doPerfil.filter((h) => chaves.includes(normalizar(h)));
  const habilidades = [...alinhadas, ...doPerfil.filter((h) => !alinhadas.includes(h))];

  const experiencias = ordenados.filter((/** @type {any} */ e) => e.item.tipo !== "projeto");
  const projetos = ordenados.filter((/** @type {any} */ e) => e.item.tipo === "projeto");
  const melhor = ordenados.find((/** @type {any} */ e) => e.pontos > 0)?.item || null;

  /** @type {string[]} */
  const avisos = [];
  if (lacunas.length > 0) avisos.push(`A vaga pede ${lacunas.join(", ")}, que não está no Perfil: não incluí.`);
  if (casadas.length === 0) avisos.push("Nenhuma palavra-chave técnica da vaga bate com o Perfil: mantive a ordem original.");

  return {
    cv: {
      identificacao: perfil.identificacao,
      resumo: montarResumo(perfil, alinhadas, melhor) || null,
      experiencias: experiencias.slice(0, MAX_EXPERIENCIAS),
      projetos: projetos.slice(0, MAX_PROJETOS),
      formacao: perfil.formacao,
      habilidades,
      idiomas: perfil.habilidades.idiomas
    },
    avisos,
    palavrasChave: { casadas, lacunas }
  };
}

module.exports = { montarConteudo, palavrasChave, montarResumo, TERMOS_TECNICOS };
