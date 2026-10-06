---
name: escrever-spec
description: Escreve (e ensina a escrever) uma spec de funcionalidade com bounded context, linguagem ubíqua, critérios de aceitação EARS e cenários BDD em Gherkin, salva em docs/specs/. Use quando o usuário pedir uma spec, critérios de aceitação, requisitos EARS, cenários BDD/Gherkin, ou quiser aprender esse processo.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(git *)
---

# Escrever spec (modo professor)

Você está escrevendo uma spec **e ensinando** a pessoa ao mesmo tempo.
Em cada etapa: (1) explique em 1–2 frases **o que** é o conceito e **por que**
ele existe, (2) faça, (3) mostre o resultado e pergunte se ela quer ajustar
antes de seguir. Linguagem simples, em português.

## Etapa 1 — Entender o que já existe

Leia `CLAUDE.md`, `README` e o código da funcionalidade.
**Ensine:** spec boa descreve o comportamento *real* (ou desejado), não
inventado. Cite os trechos de código que você vai usar como base.

## Etapa 2 — Bounded Context

Divida o sistema em contextos com responsabilidade única (ex.: Cadastro,
Preenchimento, Mapeamento). Monte uma tabela: contexto, responsabilidade,
onde vive no código. Escreva as **fronteiras**: quem lê/escreve o quê.
**Ensine:** um bounded context é uma "fronteira de significado" do DDD —
dentro dela cada palavra tem um sentido só. Isso evita que uma mudança num
lugar quebre outro.

## Etapa 3 — Linguagem Ubíqua

Glossário com: termo, definição, nome no código. Liste também "termos a
evitar". Use **Maiúscula Inicial** nos termos no resto da spec.
**Ensine:** é o vocabulário comum entre negócio e código; se a conversa
diz "Candidata" e o código diz `user`, alguém vai se confundir.

## Etapa 4 — Critérios EARS

Escreva os critérios usando os 5 padrões (um de cada, se couber):

| Padrão | Molde |
|---|---|
| Ubíquo | O sistema **deve** <resposta>. |
| Evento | **Quando** <gatilho>, o sistema **deve** <resposta>. |
| Estado | **Enquanto** <estado>, o sistema **deve** <resposta>. |
| Indesejado | **Se** <problema>, **então** o sistema **deve** <resposta>. |
| Opcional | **Onde** <funcionalidade existir>, o sistema **deve** <resposta>. |

Numere (R1…Rn). Cada um precisa ser testável: verbo claro, sem "rápido",
"fácil", "adequado".
**Ensine:** EARS (Rolls-Royce, 2009) limita a frase a moldes fixos para
eliminar ambiguidade. Mostre por que cada critério caiu naquele padrão.

## Etapa 5 — Cenários BDD (Gherkin)

Use `# language: pt` e `Funcionalidade / Contexto / Cenário / Dado / Quando
/ Então / E`. Cada cenário com comentário `# Cobre Rx`. Use os termos da
linguagem ubíqua e dados fictícios.
**Ensine:** EARS diz *a regra*; BDD dá *um exemplo concreto* dela.
Dado = situação inicial, Quando = ação, Então = resultado observável.

## Etapa 6 — Rastreabilidade e escopo

Tabela critério → cenário → código, e uma seção "Fora do escopo".
**Ensine:** rastrear mostra quais regras ainda não têm teste.

## Etapa 7 — Entregar

Salve em `docs/specs/<funcionalidade>.md`. Crie branch `docs/spec-<nome>`,
commit no padrão Conventional Commits (`docs: adiciona spec ...`) e, se a
pessoa autorizar, faça push e indique o link para abrir o PR/MR.
**Ensine:** spec vai para o repositório para evoluir junto com o código.

## Regras

- Nunca use dados reais de currículo.
- Não invente comportamento que o código não tem sem marcar como "planejado".
- Termine com um resumo de 3 linhas do que a pessoa aprendeu.
