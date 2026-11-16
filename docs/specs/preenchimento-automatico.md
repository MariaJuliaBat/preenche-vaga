# Spec: Preenchimento Automático de Candidatura

> Status: rascunho · Versão da extensão: 0.2.0
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
| **Cadastro de Currículo** | A Candidata cria e edita seu Currículo | `popup/` + `chrome.storage.local` | implementado |
| **Preenchimento de Candidatura** *(foco desta spec)* | Encontrar Campos na página, reconhecê-los e preenchê-los | `content/preencher.js` | implementado |
| **Mapeamento de Sites** | Manter os Sinônimos que ligam Campos a Dados do Currículo | `content/mapeamento.js` + skill `mapear-site-vaga` | implementado |

**Fronteiras e contratos**

- *Preenchimento* **lê** o Currículo, mas nunca o altera (isso é papel do
  *Cadastro*).
- *Preenchimento* **consulta** o Mapeamento (`MAPEAMENTO_CAMPOS`), mas nunca
  cria Sinônimos (isso é papel do *Mapeamento de Sites*).
- Nenhum contexto tem permissão para **Enviar** a candidatura. Enviar é ato
  exclusivo da Candidata.
- O Currículo real fica só em `chrome.storage.local` (neste navegador), nunca
  no repositório. O *Cadastro* entrega o Currículo ao *Preenchimento* só quando
  a Candidata clica em "Preencher esta página". Não há preenchimento automático
  ao abrir páginas, porque qualquer site consegue ler o valor de um Campo
  preenchido mesmo sem Enviar.

## 3. Linguagem Ubíqua

Termos que devem ser usados **igual** em conversas, issues, commits, testes e
código.

| Termo | Definição | No código |
|---|---|---|
| **Candidata** | Pessoa que usa a extensão para se candidatar a vagas. | — |
| **Currículo** | Conjunto de Dados do Currículo da Candidata, cadastrado uma única vez. | `curriculo` |
| **Dado do Currículo** | Uma informação do Currículo que a extensão sabe Preencher: nome, email, telefone, cidade, linkedin, portfolio, objetivo, resumo, curso, instituicao, cargo, empresa, habilidades, idiomas. | chaves de `curriculo` |
| **Importar** | Ler um arquivo .docx da Candidata no próprio navegador e transformá-lo em Dados do Currículo, para ela revisar antes de salvar. | `popup/importar-docx.js` |
| **Currículo Completo** | Tudo o que foi lido do .docx (experiências, formações, projetos, cursos...), guardado junto do Currículo para usos futuros. | `curriculoCompleto` |
| **Portfólio** | Link para trabalhos da Candidata (GitHub ou site pessoal). | `portfolio` |
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
| **R2** | Orientado a evento | **Quando** a Candidata pedir para Preencher (botão "Preencher esta página" no popup), a extensão **deve** Reconhecer cada Campo pelas Pistas na ordem label → name → id → placeholder e Preencher o Dado do Currículo correspondente. |
| **R3** | Orientado a estado | **Enquanto** um Campo já estiver preenchido, desabilitado ou somente leitura, a extensão **deve** mantê-lo como Campo Ignorado, sem alterar seu valor. |
| **R4** | Comportamento indesejado | **Se** nenhuma Pista do Campo contiver um Sinônimo do Mapeamento, **então** a extensão **deve** deixar o Campo vazio, sem erro e sem interromper o preenchimento dos demais Campos. |
| **R5** | Opcional (funcionalidade) | **Onde** o Campo for uma lista de seleção (`select`), a extensão **deve** escolher a opção cujo texto ou valor Normalizado contenha o Dado do Currículo e, se não houver opção correspondente, deixar a seleção inalterada. |
| **R6** | Orientado a evento | **Quando** a Candidata escolher um arquivo .docx no popup, a extensão **deve** ler o arquivo no próprio navegador, extrair os Dados do Currículo e o Currículo Completo, e mostrá-los nos Campos do popup para revisão, **sem** salvar nem enviar o arquivo a nenhum servidor. |
| **R7** | Comportamento indesejado | **Se** o arquivo escolhido não for um .docx legível, **então** a extensão **deve** avisar a Candidata e manter o Currículo já salvo inalterado. |

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
    Quando a Candidata pedir para Preencher a página
    Então o Campo "Nome completo" deve conter "Ana Souza"
    E o Campo "E-MAIL" deve conter "ana@exemplo.com"
    E a candidatura não deve ter sido Enviada

  # Cobre R3
  Cenário: Não sobrescrever Campo já preenchido pela Candidata
    Dado um Formulário de Candidatura com o Campo de label "Nome" contendo "Ana S."
    Quando a Candidata pedir para Preencher a página
    Então o Campo "Nome" deve continuar contendo "Ana S."

  # Cobre R4
  Cenário: Campo sem Sinônimo é ignorado sem quebrar os demais
    Dado um Formulário de Candidatura com o Campo de label "Pretensão salarial"
    E um Campo de label "E-mail"
    Quando a Candidata pedir para Preencher a página
    Então o Campo "Pretensão salarial" deve continuar vazio
    E o Campo "E-mail" deve conter "ana@exemplo.com"

  # Cobre R2
  Cenário: Preencher o Portfólio pela label ou pelo placeholder
    Dado que o Currículo da Candidata tem o portfolio "github.com/anasouza-exemplo"
    E um Formulário de Candidatura com o Campo de label "Portfólio"
    E um Campo sem label com placeholder "Link do seu GitHub"
    Quando a Candidata pedir para Preencher a página
    Então os dois Campos devem conter "github.com/anasouza-exemplo"

  # Cobre R6
  Cenário: Importar o Currículo de um arquivo .docx
    Dado um arquivo .docx com nome, e-mail, experiências e formações da Candidata
    Quando a Candidata escolher o arquivo no popup
    Então os Campos do popup devem mostrar os Dados do Currículo lidos
    E o Currículo só deve ser salvo quando a Candidata clicar em "Salvar Currículo"

  # Cobre R7
  Cenário: Arquivo que não é .docx não altera o Currículo salvo
    Dado um Currículo já salvo
    Quando a Candidata escolher um arquivo que não é .docx
    Então o popup deve avisar que não consegue ler o arquivo
    E o Currículo salvo deve continuar igual
```

## 6. Rastreabilidade

| Critério | Cenário BDD | Código |
|---|---|---|
| R1 | Preencher Campos reconhecidos sem Enviar | `preencher.js` (ausência de `.submit()`; tipos `submit`/`button` ignorados) |
| R2 | Preencher Campos reconhecidos sem Enviar | `obterTextosDoCampo`, `encontrarCampo`, botão "Preencher esta página" em `popup/popup.js` |
| R3 | Não sobrescrever Campo já preenchido | `if (elemento.disabled \|\| elemento.readOnly)`, `if (elemento.value.trim())` |
| R4 | Campo sem Sinônimo é ignorado | `if (!valor) continue;` |
| R5 | — (candidato a cenário futuro) | `preencherSelect` |
| R6 | Importar o Currículo de um arquivo .docx | `popup/importar-docx.js` (`importar`, `interpretar`), `tests/importar-docx.test.js` |
| R7 | Arquivo que não é .docx não altera o Currículo salvo | `listarEntradas` (mensagens de erro), `popup/popup.js` |

## 7. Fora do escopo

- Importar currículo em PDF ou fotografado (só .docx por enquanto), CAPTCHA, senha e aceite de termos.
- **Enviar candidaturas automaticamente.** Hoje a Candidata sempre revisa e envia (R1). Uma automação de envio é uma mudança de regra: exige nova decisão e nova spec, e precisa respeitar os termos de uso de cada Site de Vagas.
