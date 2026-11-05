# Preenche Vaga

## Contexto
Extensão do Chrome que preenche automaticamente formulários de candidatura
em sites de vagas (Gupy, Vagas.com, Catho) usando os dados do currículo que
a pessoa cadastra uma única vez. A extensão preenche os campos, mas NUNCA
envia a candidatura: a pessoa sempre revisa e clica em enviar.

## Stack
- Chrome Extension Manifest V3
- JavaScript puro (sem framework, sem etapa de build)
- Dados do currículo salvos em chrome.storage.local

## Estrutura
- manifest.json
- popup/ — tela onde a pessoa cadastra o currículo (digitando ou importando um .docx em popup/importar-docx.js)
- content/ — script que encontra e preenche os campos da página
- paginas-teste/ — formulários falsos para testar sem usar sites reais

## Convenções
- Todo mapeamento de campo fica em content/mapeamento.js, nunca espalhado.
- Para identificar um campo, usar label, name, id e placeholder, nessa ordem.
- Nunca chamar .submit() nem clicar em botões de envio.
- Nunca commitar dados reais de currículo; usar só dados fictícios.
- O currículo real nunca vai para o repositório: nada de .docx, JSON ou texto de currículo real em arquivos, testes ou commits (os testes montam um .docx fictício em memória).
- Preencher só quando a pessoa clica em "Preencher esta página" no popup;
  nada de content_scripts automáticos com dados do currículo.

## Comandos
- `npx serve paginas-teste` — sobe as páginas de teste em http://localhost:3000
- Carregar a extensão: chrome://extensions → Modo do desenvolvedor →
  "Carregar sem compactação" → selecionar a pasta do projeto