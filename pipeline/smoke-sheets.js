#!/usr/bin/env node
// Smoke test REAL do módulo Sheets. Use só com uma planilha de TESTE fictícia, compartilhada com a Service Account.
//   node pipeline/smoke-sheets.js             só lê (cabeçalho, URLs, último número, próxima linha)
//   node pipeline/smoke-sheets.js --escrever  também grava UMA linha fictícia marcada com [TESTE]
const { lerArquivoEnv, montarConfig, validar, extrairIdGoogle } = require("./config");
const { criarClienteSheets, lerVagas, registrarVagas } = require("./sheets");

async function main() {
  const env = { ...lerArquivoEnv(), ...process.env };
  const config = montarConfig(env);
  const erros = validar(config, env, ["radar"]);
  if (erros.length > 0) throw new Error(erros.join("\n"));

  const planilhaId = extrairIdGoogle(config.googleSheetUrl);
  const cliente = criarClienteSheets({ contaDeServico: config.contaDeServico });

  const lido = await lerVagas(cliente, planilhaId);
  console.log(`Cabeçalho ok. URLs existentes: ${lido.urlsExistentes.size}, último número: ${lido.ultimoNumero}, próxima linha: ${lido.proximaLinha}`);

  if (process.argv.includes("--escrever")) {
    const r = await registrarVagas(cliente, { planilhaId, escreverPlanilha: true }, [{
      titulo: "[TESTE] Vaga fictícia", url: `https://exemplo.com.br/teste/${Date.now()}`, empresa: "Empresa Fictícia",
      site: "Teste", situacao: "pendente", motivoPendencia: "Smoke test - pode apagar", observacoes: "[TESTE]"
    }]);
    console.log(`Gravei ${r.escritas} linha(s) a partir da linha ${r.linhaInicial}. Apague a linha de teste depois.`);
  }
}

main().catch((erro) => { console.error(`Erro: ${erro.message}`); process.exitCode = 1; });
