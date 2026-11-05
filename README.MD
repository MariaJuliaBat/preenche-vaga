# Preenche Vaga

Quem procura emprego preenche os mesmos dados (nome, contato, experiência,
formação) dezenas de vezes, em sites diferentes, e isso toma horas que
poderiam ir para preparar entrevistas. O Preenche Vaga guarda o currículo
uma única vez e completa esses formulários automaticamente em poucos segundos.
A pessoa continua no controle: revisa tudo e decide quando enviar.
Assim, ela consegue se candidatar a mais vagas, com menos cansaço e menos erros de digitação.

## Como usar com o seu currículo

1. Baixe o projeto e rode `npm install`.
2. No Chrome, abra `chrome://extensions`, ligue o **Modo do desenvolvedor**,
   clique em **Carregar sem compactação** e escolha a pasta do projeto.
3. Clique no ícone do Preenche Vaga (fixe-o no quebra-cabeça 🧩 da barra),
   preencha o seu currículo e clique em **Salvar Currículo**. Os dados ficam
   só no seu navegador, nunca no GitHub.
4. Abra o formulário da vaga, clique no ícone e em **Preencher esta página**.
5. Revise tudo e envie você mesma. A extensão nunca envia.

Para testar sem site real: `npx serve paginas-teste` e abra http://localhost:3000/formulario.