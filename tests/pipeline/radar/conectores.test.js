// Conectores de busca (Gupy, LinkedIn, Indeed) e áreas de TI de nível de entrada. Sem rede: fetch e navegador FALSOS, dados fictícios.
// ATENÇÃO: o formato da Gupy foi conferido numa chamada real. O HTML do LinkedIn e do Indeed NÃO pôde ser conferido ao vivo
// (os dois bloquearam o acesso automatizado), então os fixtures abaixo seguem o formato conhecido e merecem conferência com o site real.
const test = require("node:test");
const assert = require("node:assert");
const { criarConectorGupy } = require("../../../pipeline/radar/conectores/gupy");
const { criarConectorLinkedin, lerCartoes } = require("../../../pipeline/radar/conectores/linkedin");
const { criarConectorIndeed, lerCartoesIndeed, diasAtras } = require("../../../pipeline/radar/conectores/indeed");
const { criarConectores } = require("../../../pipeline/radar/conectores");
const { TERMOS_DE_BUSCA, textoDoHtml } = require("../../../pipeline/radar/conectores/comum");
const { classificar } = require("../../../pipeline/radar/classificar");
const { pontuar } = require("../../../pipeline/radar/pontuar");
const { montarConfig } = require("../../../pipeline/config");
const { executarRadar } = require("../../../pipeline/radar/index");

const HOJE = new Date("2026-11-20T12:00:00Z");
const semPausa = async () => {};
const CTX = { hoje: HOJE, vigenciaDias: 20 };

const GUPY = (extra = {}) => ({
  id: 1, name: "Estágio em Infraestrutura de TI", applicationDeadline: "2026-12-28T00:00:00.000Z", careerPageName: "Empresa Exemplo",
  type: "vacancy_type_internship", publishedDate: "2026-11-18T16:04:54.929Z", workplaceType: "on-site", city: "Brasília", state: "Distrito Federal",
  jobUrl: "https://exemplo.gupy.io/job/abc1?jobBoardSource=gupy_portal", description: "<p>Apoiar o suporte técnico&nbsp;(N1) e a rede.</p>", ...extra
});

function fetchFalso(respostas) {
  const urls = [];
  const impl = async (url) => {
    urls.push(String(url));
    const r = typeof respostas === "function" ? respostas(String(url), urls.length) : respostas;
    return { ok: r.status ? r.status < 400 : true, status: r.status || 200, json: async () => r.json, text: async () => r.texto ?? "" };
  };
  return { impl, urls };
}

test("termos de busca: os pedidos para Estágio de TI e Júnior", () => {
  assert.deepStrictEqual([...TERMOS_DE_BUSCA], ["estágio TI", "estágio tecnologia", "estágio desenvolvimento", "estágio programação", "desenvolvedor júnior", "analista de suporte estágio"]);
});

test("textoDoHtml: tira tags e resolve entidades", () => {
  assert.strictEqual(textoDoHtml("<p>Suporte&nbsp;t&eacute;cnico &amp; redes</p><script>x()</script> &#233; &#x41;"), "Suporte t&eacute;cnico & redes é A");
});

test("Gupy: busca DF e remoto por termo na API pública, traduz estágio, modalidade e data, sem duplicar", async () => {
  const f = fetchFalso((url) => ({ json: { data: url.includes("workplaceType=remote") ? [GUPY({ id: 2, jobUrl: "https://exemplo.gupy.io/job/remoto1", workplaceType: "remote", name: "Estágio Dev" })] : [GUPY()], pagination: {} } }));
  const c = criarConectorGupy({ termos: ["estágio TI", "estágio tecnologia"], fetchImpl: f.impl, esperar: semPausa, agora: () => HOJE });
  const vagas = await c.buscar({ foco: "geral" });
  assert.strictEqual(f.urls.length, 4); // 2 termos x (DF + remoto)
  assert.ok(f.urls.some((u) => u.includes("jobName=est%C3%A1gio%20TI") && u.includes("state=Distrito%20Federal")));
  assert.ok(f.urls.some((u) => u.includes("workplaceType=remote")));
  assert.deepStrictEqual(vagas.map((v) => v.url), ["https://exemplo.gupy.io/job/abc1?jobBoardSource=gupy_portal", "https://exemplo.gupy.io/job/remoto1"]); // sem repetidas
  assert.deepStrictEqual([vagas[0].modalidade, vagas[0].nivel, vagas[0].local, vagas[0].empresa, vagas[0].fonte], ["presencial", "estágio", "Brasília - Distrito Federal", "Empresa Exemplo", "Gupy"]);
  assert.strictEqual(vagas[0].descricao, "Apoiar o suporte técnico (N1) e a rede.");
  assert.strictEqual(vagas[1].modalidade, "remoto");
  assert.strictEqual(vagas[0].encerrada, false);
});

test("Gupy: foco DF só busca o Distrito Federal; prazo vencido marca encerrada; uma busca com erro não derruba as outras", async () => {
  const f = fetchFalso((url, n) => (n === 1 ? { status: 500 } : { json: { data: [GUPY({ applicationDeadline: "2026-01-01T00:00:00.000Z" })] } }));
  const c = criarConectorGupy({ termos: ["a", "b"], fetchImpl: f.impl, esperar: semPausa, agora: () => HOJE });
  const vagas = await c.buscar({ foco: "df" });
  assert.strictEqual(f.urls.length, 2);
  assert.ok(f.urls.every((u) => u.includes("state=Distrito%20Federal") && !u.includes("remote")));
  assert.strictEqual(vagas.length, 1);
  assert.strictEqual(vagas[0].encerrada, true);
  await assert.rejects(() => criarConectorGupy({ termos: ["a"], fetchImpl: fetchFalso({ status: 503 }).impl, esperar: semPausa }).buscar({ foco: "df" }), /Gupy respondeu 503/);
});

const CARTAO_LINKEDIN = (id, titulo, empresa, local, data) => `<li><div class="base-card base-search-card job-search-card" data-entity-urn="urn:li:jobPosting:${id}">
  <a class="base-card__full-link" href="https://br.linkedin.com/jobs/view/estagio-ti-at-empresa-${id}?position=1&amp;pageNum=0&amp;refId=xyz&amp;trackingId=abc"><span class="sr-only">${titulo}</span></a>
  <div class="base-search-card__info"><h3 class="base-search-card__title">
      ${titulo}
    </h3><h4 class="base-search-card__subtitle"><a class="hidden-nested-link" href="https://br.linkedin.com/company/x">${empresa}</a></h4>
    <div class="base-search-card__metadata"><span class="job-search-card__location">${local}</span>
      <time class="job-search-card__listdate" datetime="${data}">1 dia atrás</time></div></div></div></li>`;

test("LinkedIn: lê os cartões da busca pública (link sem rastreio, empresa, local, data)", () => {
  const html = CARTAO_LINKEDIN(111, "Estágio em TI", "Empresa A &amp; Cia", "Brasília, Federal District, Brazil", "2026-11-19") + "<li>sem link</li>";
  const [v, ...resto] = lerCartoes(html, "presencial_ou_hibrido");
  assert.strictEqual(resto.length, 0);
  assert.deepStrictEqual(v, { titulo: "Estágio em TI", url: "https://br.linkedin.com/jobs/view/estagio-ti-at-empresa-111", empresa: "Empresa A & Cia", local: "Brasília, Federal District, Brazil", modalidade: undefined, publicadaEm: "2026-11-19", fonte: "LinkedIn" });
  assert.strictEqual(lerCartoes(html, "remoto")[0].modalidade, "remoto");
});

test("LinkedIn: usa a busca guest (sem login), 14 dias e Brasília; remoto à parte", async () => {
  const f = fetchFalso({ texto: CARTAO_LINKEDIN(1, "Estágio TI", "A", "Brasília, Federal District, Brazil", "2026-11-19") });
  const vagas = await criarConectorLinkedin({ termos: ["estágio TI"], fetchImpl: f.impl, esperar: semPausa }).buscar({ foco: "geral" });
  assert.strictEqual(f.urls.length, 2);
  assert.ok(f.urls[0].startsWith("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?"));
  assert.ok(f.urls[0].includes("keywords=est%C3%A1gio%20TI") && f.urls[0].includes("location=Bras%C3%ADlia%2C%20Federal%20District%2C%20Brazil") && f.urls[0].includes("f_TPR=r1209600"));
  assert.ok(f.urls[1].includes("f_WT=2")); // remoto
  assert.strictEqual(vagas.length, 1); // a mesma vaga nas duas buscas não duplica
});

test("LinkedIn: 429 ou 999 PARA a busca, com a mensagem de que o limite não é contornado (nenhuma nova tentativa)", async () => {
  for (const status of [429, 999, 403]) {
    const f = fetchFalso({ status });
    await assert.rejects(() => criarConectorLinkedin({ termos: ["a", "b", "c"], fetchImpl: f.impl, esperar: semPausa }).buscar({ foco: "geral" }), /Não contorno esse limite/);
    assert.strictEqual(f.urls.length, 1, `HTTP ${status}: uma requisição só`);
  }
});

const CARTAO_INDEED = (jk, titulo, empresa, local, data) => `<div class="job_seen_beacon"><table><tr><td><h2 class="jobTitle"><a data-jk="${jk}" href="/rc/clk?jk=${jk}"><span title="${titulo}">${titulo}</span></a></h2>
  <span data-testid="company-name">${empresa}</span><div data-testid="text-location">${local}</div>
  <div class="job-snippet"><ul><li>Apoiar o suporte técnico</li></ul></div><span class="date">${data}</span></td></tr></table></div>`;

test("Indeed: diasAtras lê 'há N dias', 'hoje' e 'mais de 30'", () => {
  assert.strictEqual(diasAtras("Publicada há 3 dias"), 3);
  assert.strictEqual(diasAtras("Postado há 1 dia"), 1);
  assert.strictEqual(diasAtras("Hoje"), 0);
  assert.strictEqual(diasAtras("Publicada há mais de 30 dias"), 31);
  assert.strictEqual(diasAtras("sem data"), null);
});

test("Indeed: lê os cartões (link /viewjob?jk=, data aproximada; sem data vale o filtro de 14 dias)", () => {
  const html = CARTAO_INDEED("abc123def4", "Estágio em TI", "Empresa B", "Brasília, DF", "Publicada há 3 dias") + CARTAO_INDEED("fff999", "Estágio Dev", "Empresa C", "Remoto", "");
  const [a, b] = lerCartoesIndeed(html, HOJE, "presencial_ou_hibrido");
  assert.deepStrictEqual([a.titulo, a.url, a.empresa, a.local, a.descricao, a.fonte], ["Estágio em TI", "https://br.indeed.com/viewjob?jk=abc123def4", "Empresa B", "Brasília, DF", "Apoiar o suporte técnico", "Indeed"]);
  assert.strictEqual(a.publicadaEm, "2026-11-17T12:00:00.000Z");
  assert.strictEqual(b.publicadaEm, "2026-11-06T12:00:00.000Z"); // 14 dias
});

function navegadorFalso(paginas) {
  let n = 0;
  const estado = { fechou: false, urls: [] };
  const pagina = {
    goto: async (url) => { estado.urls.push(url); const p = paginas[Math.min(n++, paginas.length - 1)]; pagina.atual = p; return { status: () => p.status }; },
    title: async () => pagina.atual.titulo,
    content: async () => pagina.atual.html
  };
  return { estado, abrir: async () => ({ newPage: async () => pagina, close: async () => { estado.fechou = true; } }) };
}

test("Indeed: busca por termo em Brasília e Remoto com fromage=14 e sempre fecha o navegador", async () => {
  const n = navegadorFalso([{ status: 200, titulo: "Vagas - Indeed", html: CARTAO_INDEED("aaa1", "Estágio TI", "X", "Brasília, DF", "Hoje") }]);
  const vagas = await criarConectorIndeed({ termos: ["estágio TI"], abrir: n.abrir, esperar: semPausa, agora: () => HOJE }).buscar({ foco: "geral" });
  assert.strictEqual(n.estado.urls.length, 2);
  assert.match(n.estado.urls[0], /^https:\/\/br\.indeed\.com\/jobs\?q=est%C3%A1gio\+TI&l=Bras%C3%ADlia%2C\+DF&fromage=14/);
  assert.match(n.estado.urls[1], /&l=Remoto&fromage=14/);
  assert.strictEqual(vagas.length, 1);
  assert.strictEqual(n.estado.fechou, true);
});

test("Indeed: verificação anti-robô (403 / 'Blocked' / 'Security Check') PARA, relata e fecha o navegador; não tenta de novo", async () => {
  for (const pagina of [{ status: 403, titulo: "Blocked - Indeed.com", html: "" }, { status: 200, titulo: "Security Check - Indeed.com", html: "" }]) {
    const n = navegadorFalso([pagina]);
    await assert.rejects(() => criarConectorIndeed({ termos: ["a", "b"], abrir: n.abrir, esperar: semPausa }).buscar({ foco: "geral" }), /verificação anti-robô.*Não contorno/);
    assert.strictEqual(n.estado.urls.length, 1);
    assert.strictEqual(n.estado.fechou, true);
  }
});

test("RADAR_FONTES: padrão gupy, linkedin, indeed, github; escolher e ordenar; fonte desconhecida é erro (Trampos incluso)", () => {
  assert.deepStrictEqual(montarConfig({}).radar.fontes, ["gupy", "linkedin", "indeed", "github"]);
  assert.deepStrictEqual(montarConfig({ RADAR_FONTES: " Gupy , github,gupy" }).radar.fontes, ["gupy", "github"]);
  assert.throws(() => montarConfig({ RADAR_FONTES: "gupy,trampos" }), /fonte desconhecida \("trampos"\)/);
});

test("criarConectores segue RADAR_FONTES e põe as fontes de Brasília antes do GitHub", () => {
  const nomes = (env) => criarConectores(montarConfig(env)).map((c) => c.nome);
  assert.deepStrictEqual(nomes({ RADAR_REPOS_GITHUB: "a/b" }), ["Gupy", "LinkedIn", "Indeed", "GitHub (a/b)"]);
  assert.deepStrictEqual(nomes({ RADAR_FONTES: "github,gupy", RADAR_REPOS_GITHUB: "a/b" }), ["GitHub (a/b)", "Gupy"]);
});

test("uma fonte bloqueada não derruba as outras: aparece em falhas e as vagas das demais seguem", async () => {
  const bloqueado = { nome: "Indeed", buscar: async () => { throw new Error("O Indeed pediu verificação anti-robô (HTTP 403)."); } };
  const gupy = { nome: "Gupy", buscar: async () => [{ titulo: "Estágio em TI", url: "https://exemplo.gupy.io/job/1", empresa: "X", local: "Brasília - Distrito Federal", modalidade: "presencial", nivel: "estágio", publicadaEm: "2026-11-18T00:00:00Z", fonte: "Gupy" }] };
  const r = await executarRadar({ conectores: [bloqueado, gupy], hoje: HOJE });
  assert.deepStrictEqual(r.falhas.map((f) => f.conector), ["Indeed"]); // a cota DF já fechou: sem segunda busca
  assert.strictEqual(r.aprovadas.length, 1);
  assert.strictEqual(r.aprovadas[0].ehVagaDF, true);
});

// ---- Estágio e Júnior em outras áreas de TI ----

const vaga = (titulo, extra = {}) => ({ titulo, url: `https://exemplo.gupy.io/job/${encodeURIComponent(titulo)}`, descricao: "", publicadaEm: "2026-11-18T00:00:00Z", local: "Brasília - Distrito Federal", modalidade: "presencial", fonte: "t", ...extra });

test("Estágio e Júnior aceitam as áreas de TI pedidas (dev, TI geral, suporte, infra, dados, QA, RPA, IA, segurança)", () => {
  const aceitas = [
    "Estágio em Desenvolvimento Full-Stack", "Estágio Back-End", "Estágio Front-End", "Estágio Mobile", "Estagiário de Software",
    "Estágio em Tecnologia da Informação", "Estágio em Sistemas", "Estágio Analista de Sistemas",
    "Estágio em Suporte Técnico", "Estágio Service Desk", "Estágio em Infraestrutura", "Estágio em Redes de Computadores", "Estágio Cloud",
    "Estágio em Dados", "Estágio em BI", "Estágio em Análise de Dados", "Estágio em Banco de Dados",
    "Estágio em QA", "Estágio em Testes de Software", "Estágio em Automação", "Estágio RPA", "Estágio em IA Aplicada", "Estágio em Segurança da Informação",
    "Analista de Suporte Júnior", "Analista de Infraestrutura Júnior", "Analista de BI Júnior"
  ];
  for (const t of aceitas) assert.strictEqual(classificar(vaga(t), CTX).resultado, "aprovada", t);
});

test("fora de TI continua descartado, inclusive com palavra parecida (suporte ao cliente, redes sociais)", () => {
  for (const t of ["Estágio em Marketing", "Estágio em Suporte ao Cliente", "Estágio em Redes Sociais", "Estágio em Atendimento ao Cliente", "Estágio em Direito", "Estágio em Recursos Humanos"]) {
    const c = classificar(vaga(t), CTX);
    assert.deepStrictEqual([c.resultado, c.motivo], ["descarte", "área"], t);
  }
});

test("outras áreas de TI só valem em nível de entrada: sem Estágio/Júnior no título não é aceita como TI geral", () => {
  const sem = classificar(vaga("Analista de Suporte Técnico"), CTX); // nível não identificado
  assert.deepStrictEqual([sem.resultado, sem.motivo], ["descarte", "área"]);
  assert.strictEqual(classificar(vaga("Analista de Suporte Técnico Júnior"), CTX).resultado, "aprovada");
  const pleno = classificar(vaga("Analista de Suporte Técnico Pleno"), CTX); // nível bloqueado continua valendo
  assert.deepStrictEqual([pleno.resultado, pleno.motivo], ["descarte", "nível"]);
});

test("pontuação: desenvolvimento/automação/IA ganha +3 sobre outra área de TI no mesmo nível e local", () => {
  const dev = classificar(vaga("Estágio em Desenvolvimento"), CTX);
  const suporte = classificar(vaga("Estágio em Suporte Técnico"), CTX);
  const rpa = classificar(vaga("Estágio em Automação RPA"), CTX);
  assert.deepStrictEqual([dev.area, suporte.area, rpa.area], ["dev", "ti", "dev"]);
  const p = (c, titulo) => pontuar(vaga(titulo), c).pontos;
  assert.strictEqual(p(dev, "Estágio em Desenvolvimento") - p(suporte, "Estágio em Suporte Técnico"), 3);
  assert.strictEqual(p(rpa, "Estágio em Automação RPA"), p(dev, "Estágio em Desenvolvimento"));
});
