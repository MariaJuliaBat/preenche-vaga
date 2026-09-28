---
name: mapear-site-vaga
description: Adiciona suporte a um novo site de vagas na extensão, mapeando os campos do formulário de candidatura para os dados do currículo em content/mapeamento.js. Use quando o usuário pedir para suportar um site novo (ex. Gupy, Vagas.com, Catho) ou quando um campo de um site não estiver sendo preenchido.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Mapear site de vaga

1. Leia o HTML do formulário do site (salvo em paginas-teste/).
2. Liste cada campo encontrado com seu label, name, id e placeholder.
3. Relacione cada campo a um dado do currículo usando a tabela de
   sinônimos do [reference.md](reference.md).
4. Adicione os sinônimos novos em content/mapeamento.js, sem apagar os
   existentes.
5. Liste os campos que ficaram sem correspondência e pergunte ao usuário o que fazer.

Nunca mapeie campos de senha, CAPTCHA ou aceite de termos.
