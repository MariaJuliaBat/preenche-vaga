// Módulo 1 e 5: leitura, deduplicação e escrita na Planilha de Controle (Google Sheets, aba "Vagas").
// Fala com a API REST do Sheets via fetch, autenticando com a Service Account. O cliente é injetável,
// então os testes usam um cliente falso e nunca tocam na rede.
const { readFileSync } = require("node:fs");
const { PLANILHA } = require("./config");

const ESCOPO = "https://www.googleapis.com/auth/spreadsheets";
const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

/** @param {string} texto */
const normalizar = (texto) => String(texto ?? "")
  .toLocaleLowerCase("pt-BR")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .trim();

/**
 * Forma canônica de uma URL de vaga, para comparar duplicatas: sem #fragmento, sem parâmetros utm, gclid e fbclid,
 * host em minúsculas, sem "/" final.
 * @param {string} url
 */
function normalizarUrl(url) {
  const texto = String(url ?? "").trim();
  if (!texto) return "";
  try {
    const u = new URL(texto);
    u.hash = "";
    for (const chave of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(chave) || ["gclid", "fbclid"].includes(chave.toLowerCase())) u.searchParams.delete(chave);
    }
    u.searchParams.sort();
    const caminho = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host.toLowerCase()}${caminho}${u.search}`;
  } catch {
    return texto.toLowerCase().replace(/\/+$/, "");
  }
}

/** @param {string} aba */
const intervalo = (aba, de, ate) => `'${aba.replace(/'/g, "''")}'!${de}:${ate}`;

/**
 * Cliente mínimo da API REST do Sheets.
 * @param {{ contaDeServico?: string, obterToken?: () => Promise<string>, fetchImpl?: typeof fetch }} opcoes
 */
function criarClienteSheets(opcoes) {
  const fetchImpl = opcoes.fetchImpl || fetch;
  let auth;
  const obterToken = opcoes.obterToken || (async () => {
    if (!auth) {
      // JWT direto: `keyFile`/`credentials` do GoogleAuth estão obsoletos e imprimem aviso.
      const { JWT } = require("google-auth-library");
      const chave = JSON.parse(readFileSync(opcoes.contaDeServico, "utf8"));
      auth = new JWT({ email: chave.client_email, key: chave.private_key, scopes: [ESCOPO] });
    }
    const { token } = await auth.getAccessToken();
    if (!token) throw new Error("Não consegui obter token do Google com a Service Account.");
    return token;
  });

  /** @param {string} metodo @param {string} caminho @param {unknown} [corpo] */
  const chamar = async (metodo, caminho, corpo) => {
    const resposta = await fetchImpl(`${BASE}/${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${await obterToken()}`,
        ...(corpo ? { "Content-Type": "application/json" } : {})
      },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    if (!resposta.ok) {
      const dica = resposta.status === 403 || resposta.status === 404
        ? " Confira se a planilha foi compartilhada com o e-mail da Service Account."
        : "";
      throw new Error(`Google Sheets respondeu ${resposta.status}.${dica}`);
    }
    return resposta.json();
  };

  return {
    /** @returns {Promise<string[][]>} */
    async obterValores(planilhaId, faixa) {
      const dados = await chamar("GET", `${planilhaId}/values/${encodeURIComponent(faixa)}?majorDimension=ROWS`);
      return dados.values || [];
    },
    // RAW: o texto entra literal. Com USER_ENTERED, um título de vaga começando com "=" viraria fórmula.
    async escreverValores(planilhaId, faixa, valores) {
      await chamar(
        "PUT",
        `${planilhaId}/values/${encodeURIComponent(faixa)}?valueInputOption=RAW`,
        { range: faixa, majorDimension: "ROWS", values: valores }
      );
    }
  };
}

/** @typedef {ReturnType<typeof criarClienteSheets>} ClienteSheets */

/**
 * Lê a aba "Vagas": URLs existentes (coluna C), último número (coluna A) e as linhas livres.
 * Linha livre = coluna C ("Link da vaga") vazia, mesmo que a coluna A já venha pré-numerada.
 * Recusa trabalhar se o cabeçalho da linha 4 não parecer o esperado, para não escrever na aba errada.
 * @param {ClienteSheets} cliente
 * @param {string} planilhaId
 */
async function lerVagas(cliente, planilhaId) {
  const { aba, linhaCabecalho, primeiraLinhaDeVaga } = PLANILHA;

  const [cabecalho = []] = await cliente.obterValores(planilhaId, intervalo(aba, `A${linhaCabecalho}`, `L${linhaCabecalho}`));
  if (!normalizar(cabecalho[2]).includes("link")) {
    throw new Error(
      `A coluna C da linha ${linhaCabecalho} da aba "${aba}" deveria ser "Link da vaga" (achei "${cabecalho[2] ?? ""}"). `
      + "Confira GOOGLE_SHEET_URL e a estrutura da planilha."
    );
  }

  const linhas = await cliente.obterValores(planilhaId, intervalo(aba, `A${primeiraLinhaDeVaga}`, "L"));
  const urlsExistentes = new Set();
  let ultimoNumero = 0;
  /** @type {{ linha: number, numero: number | null }[]} */
  const livres = [];

  linhas.forEach((linha, i) => {
    const [numero = "", , link = ""] = linha;
    const n = Number.parseInt(String(numero).trim(), 10);
    if (Number.isFinite(n) && n > ultimoNumero) ultimoNumero = n;
    const url = normalizarUrl(link);
    if (url) urlsExistentes.add(url);
    else livres.push({ linha: primeiraLinhaDeVaga + i, numero: Number.isFinite(n) ? n : null });
  });

  return {
    urlsExistentes,
    ultimoNumero,
    livres,
    // Depois das linhas lidas, para quando as livres acabarem.
    linhaAposDados: primeiraLinhaDeVaga + linhas.length,
    proximaLinha: livres.length > 0 ? livres[0].linha : primeiraLinhaDeVaga + linhas.length
  };
}

/**
 * @typedef {object} Vaga
 * @property {string} titulo
 * @property {string} url
 * @property {string} empresa
 * @property {string} site "Gupy", "Trampos.co"...
 * @property {"enviada" | "pendente"} situacao
 * @property {string} [prazo] vazio vira "Assim que possível"
 * @property {string} [motivoPendencia] usado na coluna K quando pendente
 * @property {string} [observacoes]
 */

/**
 * Monta a linha A..L, exatamente no mapeamento combinado.
 * @param {Vaga} vaga
 * @param {number} numero
 */
function montarLinha(vaga, numero) {
  const enviada = vaga.situacao === "enviada";
  return [
    numero,                                                        // A número sequencial
    vaga.titulo,                                                   // B título
    vaga.url,                                                      // C link individual
    vaga.empresa,                                                  // D empresa
    `Busca automática - ${vaga.site}`,                             // E origem
    "",                                                            // F
    "",                                                            // G
    "Sim",                                                         // H
    enviada ? "Candidatura enviada" : "Se candidatar",             // I
    vaga.prazo || "Assim que possível",                            // J
    enviada
      ? "Candidatura enviada - CV adaptado"
      : vaga.motivoPendencia || "Aguardando revisão - CV gerado",  // K
    vaga.observacoes || ""                                         // L
  ];
}

/**
 * Registra vagas na planilha: descarta as que já existem (ou repetidas no lote) e preenche, em ordem, as linhas
 * com a coluna C vazia (a partir da 5). Se a coluna A já veio pré-numerada, mantém o número dela (e não a reescreve,
 * para não quebrar fórmula); senão usa o próximo número depois do maior existente.
 * Com escreverPlanilha=false (--dry-run) não escreve.
 * @param {ClienteSheets} cliente
 * @param {{ planilhaId: string, escreverPlanilha: boolean }} opcoes
 * @param {Vaga[]} vagas
 */
async function registrarVagas(cliente, opcoes, vagas) {
  const { urlsExistentes, ultimoNumero, livres, linhaAposDados, proximaLinha } = await lerVagas(cliente, opcoes.planilhaId);

  const vistas = new Set(urlsExistentes);
  const novas = [];
  const duplicadas = [];
  for (const vaga of vagas) {
    const url = normalizarUrl(vaga.url);
    if (!url || vistas.has(url)) {
      duplicadas.push(vaga);
      continue;
    }
    vistas.add(url);
    novas.push(vaga);
  }

  let proximoNumero = ultimoNumero;
  const destinos = novas.map((vaga, i) => {
    const espaco = livres[i] || { linha: linhaAposDados + (i - livres.length), numero: null };
    const preNumerada = espaco.numero !== null;
    const numero = preNumerada ? /** @type {number} */ (espaco.numero) : ++proximoNumero;
    return { linha: espaco.linha, preNumerada, valores: montarLinha(vaga, numero) };
  });

  const linhas = destinos.map((d) => d.valores);
  const resultado = { escritas: linhas.length, duplicadas, linhaInicial: proximaLinha, linhas, gravado: false };
  if (linhas.length === 0 || !opcoes.escreverPlanilha) return resultado;

  const { aba } = PLANILHA;
  for (const d of destinos) {
    // Pré-numerada: grava só B..L, preservando a coluna A como está na planilha.
    const de = d.preNumerada ? "B" : "A";
    await cliente.escreverValores(
      opcoes.planilhaId,
      intervalo(aba, `${de}${d.linha}`, `L${d.linha}`),
      [d.preNumerada ? d.valores.slice(1) : d.valores]
    );
  }
  return { ...resultado, gravado: true };
}

module.exports = { normalizarUrl, criarClienteSheets, lerVagas, montarLinha, registrarVagas };
