# Spec: Preenchimento Automático de Candidatura

> Status: rascunho · Versão da extensão: 0.1.0
> Escrita com apoio de IA a partir do código em `content/` e do `CLAUDE.md`.

## 1. Objetivo

Permitir que a **Candidata** complete um **Formulário de Candidatura** em
segundos, usando o **Currículo** cadastrado uma única vez, sem perder o
controle: a extensão **preenche**, mas **nunca envia**.

## 2. Bounded Context

O sistema é dividido em contextos delimitados. Cada um tem sua própria
linguagem e responsabilidade; uma palavra pode mudar de significado ao
cruzar a fronteira.

| Contexto | Responsabilidade | Onde vive no código | Status |
|---|---|---|---|
| **Cadastro de Currículo** | A Candidata cria e edita seu Currículo | `popup/` + `chrome.storage.local` | planejado |
| **Preenchimento de Candidatura** *(foco desta spec)* | Encontrar Campos na página, reconhecê-los e preenchê-los | `content/preencher.js` | implementado |
| **Mapeamento de Sites** | Manter os Sinônimos que ligam Campos a Dados do Currículo | `content/mapeamento.js` + skill `mapear-site-vaga` | implementado |

**Fronteiras e contratos**

- *Preenchimento* **lê** o Currículo, mas nunca o altera (isso é papel do
  *Cadastro*).
- *Preenchimento* **consulta** o Mapeamento (`MAPEAMENTO_CAMPOS`), mas nunca
  cria Sinônimos (isso é papel do *Mapeamento de Sites*).
- Nenhum contexto tem permissão para **Enviar** a candidatura. Enviar é ato
  exclusivo da Candidata.

## 3. Linguagem Ubíqua

Termos que devem ser usados **igual** em conversas, issues, commits, testes e
código.

| Termo | Definição | No código |
|---|---|---|
| **Candidata** | Pessoa que usa a extensão para se candidatar a vagas. | — |
| **Currículo** | Conjunto de Dados do Currículo da Candidata, cadastrado uma única vez. | `curriculo` |
| **Dado do Currículo** | Uma informação do Currículo: nome, email, telefone, linkedin, cidade. | chaves de `curriculo` |
| **Formulário de Candidatura** | Página de um Site de Vagas onde a Candidata informa seus dados. | `document` |
| **Site de Vagas** | Plataforma que hospeda Formulários (Gupy, Vagas.com, Catho). | — |
| **Campo** | Elemento editável do formulário: `input`, `textarea` ou `select`. | `elemento` |
| **Pista do Campo** | Texto usado para reconhecer o Campo, nesta ordem de prioridade: label, name, id, placeholder. | `obterTextosDoCampo` |
| **Sinônimo** | Palavra que, presente numa Pista, liga o Campo a um Dado do Currículo. | `palavras` |
| **Mapeamento** | Lista de Sinônimos por Dado do Currículo. | `MAPEAMENTO_CAMPOS` |
| **Reconhecer** | Descobrir a qual Dado do Currículo um Campo corresponde. | `encontrarCampo` |
| **Normalizar** | Comparar textos ignorando maiúsculas e acentos ("E-MAIL" ≡ "e-mail", "Eletrônico" ≡ "eletronico"). | `normalizar` |
| **Preencher** | Escrever um Dado do Currículo num Campo e avisar a página (eventos `input` e `change`). | — |
| **Campo Ignorado** | Campo que a extensão não toca: desabilitado, somente leitura, já preenchido, ou de tipo não textual (oculto, checkbox, radio, arquivo, botões). | `continue` no laço |
| **Enviar** | Submeter a candidatura. **Ato exclusivo da Candidata.** | proibido: `.submit()` |

**Termos a evitar:** "usuário" (use *Candidata*), "input" na conversa de
negócio (use *Campo*), "autocompletar" (use *Preencher*).

## 4. Critérios de Aceitação (EARS)

EARS = *Easy Approach to Requirements Syntax*. Cada critério usa um dos 5
padrões, para não deixar ambiguidade.

| # | Padrão EARS | Requisito |
|---|---|---|
| **R1** | Ubíquo | A extensão **deve** Preencher apenas Campos e **nunca deve** Enviar o Formulário de Candidatura nem acionar botões de envio. |
| **R2** | Orientado a evento | **Quando** um Formulário de Candidatura terminar de carregar, a extensão **deve** Reconhecer cada Campo pelas Pistas na ordem label → name → id → placeholder e Preencher o Dado do Currículo correspondente. |
| **R3** | Orientado a estado | **Enquanto** um Campo já estiver preenchido, desabilitado ou somente leitura, a extensão **deve** mantê-lo como Campo Ignorado, sem alterar seu valor. |
| **R4** | Comportamento indesejado | **Se** nenhuma Pista do Campo contiver um Sinônimo do Mapeamento, **então** a extensão **deve** deixar o Campo vazio, sem erro e sem interromper o preenchimento dos demais Campos. |
| **R5** | Opcional (funcionalidade) | **Onde** o Campo for uma lista de seleção (`select`), a extensão **deve** escolher a opção cujo texto ou valor Normalizado contenha o Dado do Currículo e, se não houver opção correspondente, deixar a seleção inalterada. |

## 5. Cenários BDD

```gherkin
# language: pt
Funcionalidade: Preenchimento automático de candidatura
  Como Candidata
  Quero que meus Dados do Currículo sejam preenchidos no Formulário de Candidatura
  Para me candidatar a mais vagas com menos esforço, mantendo o controle do envio

  Contexto:
    Dado que o Currículo da Candidata tem o nome "Ana Souza" e o email "ana@exemplo.com"

  # Cobre R1 e R2
  Cenário: Preencher Campos reconhecidos sem Enviar
    Dado um Formulário de Candidatura com o Campo de label "Nome completo"
    E um Campo de label "E-MAIL"
    E um botão "Enviar candidatura"
    Quando o Formulário de Candidatura terminar de carregar
    Então o Campo "Nome completo" deve conter "Ana Souza"
    E o Campo "E-MAIL" deve conter "ana@exemplo.com"
    E a candidatura não deve ter sido Enviada

  # Cobre R3
  Cenário: Não sobrescrever Campo já preenchido pela Candidata
    Dado um Formulário de Candidatura com o Campo de label "Nome" contendo "Ana S."
    Quando o Formulário de Candidatura terminar de carregar
    Então o Campo "Nome" deve continuar contendo "Ana S."

  # Cobre R4
  Cenário: Campo sem Sinônimo é ignorado sem quebrar os demais
    Dado um Formulário de Candidatura com o Campo de label "Pretensão salarial"
    E um Campo de label "E-mail"
    Quando o Formulário de Candidatura terminar de carregar
    Então o Campo "Pretensão salarial" deve continuar vazio
    E o Campo "E-mail" deve conter "ana@exemplo.com"
```

## 6. Rastreabilidade

| Critério | Cenário BDD | Código |
|---|---|---|
| R1 | Preencher Campos reconhecidos sem Enviar | `preencher.js` (ausência de `.submit()`; tipos `submit`/`button` ignorados) |
| R2 | Preencher Campos reconhecidos sem Enviar | `obterTextosDoCampo`, `encontrarCampo`, `run_at: document_idle` |
| R3 | Não sobrescrever Campo já preenchido | `if (elemento.disabled \|\| elemento.readOnly)`, `if (elemento.value.trim())` |
| R4 | Campo sem Sinônimo é ignorado | `if (!valor) continue;` |
| R5 | — (candidato a cenário futuro) | `preencherSelect` |

## 7. Fora do escopo

- Tela de cadastro do Currículo (`popup/`) — contexto *Cadastro de Currículo*.
- Upload de arquivo de currículo (PDF), CAPTCHA, senha e aceite de termos.
