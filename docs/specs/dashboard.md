# Spec: Dashboard local do Pipeline

> Status: implementado · complementa `pipeline-candidatura.md` (P6, Cota DF) e `perfil-e-curriculo.md` (PDFs)
> O Dashboard é uma **tela local** para operar o Pipeline. Ele não decide nada: chama a CLI e mostra o que o Pipeline já gravou em `output/`.

## 1. Objetivo

1. Rodar o **Radar** e o **gerador de currículo** com um clique (sempre pela CLI, nunca reimplementando regra).
2. Ver os **PDFs** gerados dentro da própria tela.
3. Acompanhar a **Cota DF** (50% de vagas de Brasília - DF no Lote Final).
4. Auditar **Pendências**, **Pistas** e **Descartes**.

> **Ensinando:** o Dashboard é só uma *camada de leitura e disparo*. Como a regra continua na CLI, o que a tela mostra é sempre igual ao que o terminal mostraria.

## 2. Bounded Context

| Contexto | Responsabilidade | Lê | Escreve | Onde vive |
|---|---|---|---|---|
| **Pipeline** (já existe) | Radar, currículo, candidatura, logs | Doc, planilha | `output/`, planilha | `pipeline/` |
| **Dashboard** (novo) | Servir a tela, disparar a CLI, ler `output/` | `output/lote.json`, `output/cvs/`, `output/logs/*.jsonl` | nada (só inicia a CLI) | `dashboard/` |
| **Extensão** | Preencher formulário | — | — | `content/`, `popup/` (não muda) |

Fronteiras:
- O Dashboard **nunca** lê `.env`, `secrets/`, `output/perfil.json` nem a sessão do navegador, e **nunca** abre a Etapa `candidatura`: não envia candidatura.
- A única escrita é indireta: iniciar `node pipeline/cli.js`, que já respeita `--dry-run` e `AUTO_SUBMIT`.
- Texto de vaga (título, motivo, empresa) é **dado não confiável**: a tela o mostra como texto, nunca como HTML.

## 3. Linguagem Ubíqua (acrescenta)

| Termo | Definição | No código |
|---|---|---|
| **Dashboard** | Tela local em `127.0.0.1` para operar o Pipeline. | `dashboard/` |
| **Execução** | Uma chamada da CLI iniciada pela tela; só uma por vez. | `executor.js` |
| **Simulação** | Execução com `--dry-run` (padrão da tela). | `dryRun` |
| **Cota DF** | Mínimo de 50% de Vagas DF no Lote Final (RD17). | `COTA_DF`, `calcularCota` |
| **Pendência** | Candidatura pausada para intervenção humana. | `output/logs/pendencias.jsonl` |
| **Pista** | Vaga promissora para revisão manual. | `pistas.jsonl` |
| **Descarte** | Vaga recusada, com motivo. | `descartes.jsonl` |

Termos a evitar: "usuário" (use **Candidata**), "job" (use **Execução**).

## 4. Critérios de Aceitação (EARS)

| # | Padrão | Requisito |
|---|---|---|
| **D1** | Ubíquo | O Dashboard **deve** escutar só em `127.0.0.1` (porta `DASHBOARD_PORT`, padrão 4173). |
| **D2** | Indesejado | **Se** a requisição vier com `Host` diferente de `127.0.0.1` ou `localhost`, **então** o Dashboard **deve** responder 403 (proteção contra DNS rebinding). |
| **D3** | Indesejado | **Se** uma requisição que inicia Execução vier sem `Content-Type: application/json` ou com `Origin` de outro endereço, **então** o Dashboard **deve** responder 403 e não iniciar nada (proteção contra outra página abrindo a CLI). |
| **D4** | Evento | **Quando** a Candidata pedir uma Execução, o Dashboard **deve** iniciar `pipeline/cli.js` com `--only-radar` ou `--only-cv`, e **deve** recusar qualquer outra Etapa, inclusive `candidatura`. |
| **D5** | Estado | **Enquanto** uma Execução estiver rodando, o Dashboard **deve** recusar nova Execução (409) e **deve** mostrar a saída da CLI conforme ela chega. |
| **D6** | Ubíquo | A tela **deve** iniciar com Simulação ligada; **se** a Candidata a desligar, **então** a requisição **deve** trazer `confirmar: true`, senão o Dashboard **deve** recusar (400), porque sem `--dry-run` a planilha é escrita. |
| **D7** | Evento | **Quando** a Candidata abrir a aba Currículos, o Dashboard **deve** listar os PDFs de `output/cvs/` (mais novo primeiro) e exibir o escolhido dentro da tela. |
| **D8** | Indesejado | **Se** o nome pedido não for um `.pdf` direto de `output/cvs/` (ex.: `../.env`), **então** o Dashboard **deve** responder 404. |
| **D9** | Ubíquo | O Dashboard **deve** calcular a Cota DF sobre `output/lote.json`: total, vagas em Brasília - DF, remotas, percentual, cota necessária (`ceil(total × 0,5)`) e se foi atingida. |
| **D10** | Indesejado | **Se** não houver Lote Final salvo ou ele estiver vazio, **então** a tela **deve** mostrar "sem lote" em vez de 0% ou 100%. |
| **D11** | Ubíquo | O Dashboard **deve** listar Pendências, Pistas e Descartes dos arquivos `.jsonl` (mais recente primeiro), com contagem por motivo nos Descartes e filtro por texto. |
| **D12** | Indesejado | **Se** um arquivo de log não existir ou tiver linha inválida, **então** o Dashboard **deve** tratá-lo como vazio ou ignorar a linha, sem erro. |
| **D13** | Ubíquo | O Dashboard **deve** exibir títulos, motivos e saída da CLI como texto (nunca interpretar HTML) e **não deve** expor nome, contatos nem texto do currículo. |
| **D14** | Opcional | **Onde** `pendencias.jsonl` ainda não existir (a Etapa `candidatura` é futura), o Dashboard **deve** mostrar a aba Pendências vazia, com a explicação. |

## 5. Cenários BDD

```gherkin
# language: pt
Funcionalidade: Dashboard local do Pipeline
  Como Candidata
  Quero operar o Pipeline e auditar o resultado numa tela
  Para não depender só do terminal

  # Cobre D9
  Cenário: Cota DF atingida
    Dado um Lote Final com 4 vagas, 2 em Brasília - DF
    Quando eu abrir a Cota DF
    Então vejo 50%, cota necessária 2 e "atingida"

  # Cobre D9
  Cenário: Cota DF abaixo
    Dado um Lote Final com 4 vagas, 1 em Brasília - DF
    Então vejo 25%, cota necessária 2 e "abaixo da cota"

  # Cobre D10
  Cenário: Sem lote
    Dado que não existe output/lote.json
    Então vejo "sem lote", nunca 0%

  # Cobre D4 e D6
  Cenário: Simulação por padrão
    Quando eu clicar em "Gerar currículos" sem mexer na Simulação
    Então a CLI roda com --only-cv --dry-run

  # Cobre D6
  Cenário: Sem Simulação exige confirmação
    Dado a Simulação desligada
    Quando a requisição não trouxer confirmar
    Então o Dashboard recusa e nada é iniciado

  # Cobre D4
  Cenário: Candidatura não existe na tela
    Quando alguém pedir a Etapa "candidatura"
    Então o Dashboard recusa

  # Cobre D5
  Cenário: Uma Execução por vez
    Dado uma Execução em andamento
    Quando eu pedir outra
    Então o Dashboard responde 409

  # Cobre D7 e D8
  Cenário: Ver PDF e bloquear caminho fora da pasta
    Dado o PDF "01-vaga.pdf" em output/cvs
    Então ele aparece na lista e abre na tela
    Mas "../.env" responde 404

  # Cobre D2 e D3
  Cenário: Requisição de outra origem
    Quando um POST chegar com Origin "https://site-qualquer.exemplo"
    Então o Dashboard responde 403

  # Cobre D11 e D12
  Cenário: Descartes com motivo e log com linha quebrada
    Dado descartes.jsonl com 3 linhas válidas e 1 inválida
    Então vejo 3 descartes e a contagem por motivo
```

## 6. Rastreabilidade

| Critério | Cenário | Código | Teste |
|---|---|---|---|
| D1 | — | `dashboard/server.js` (`listen`) | `tests/dashboard/servidor.test.js` |
| D2, D3 | Requisição de outra origem | `validarRequisicao` | idem |
| D4, D5, D6 | Simulação, Candidatura, Uma por vez | `dashboard/executor.js`, `POST /api/execucoes` | idem |
| D7, D8 | Ver PDF | `listarCurriculos`, `GET /cvs/` | idem |
| D9, D10 | Cota DF | `dashboard/dados.js` (`calcularCota`) | idem |
| D11, D12, D14 | Descartes | `lerLog` | idem |
| D13 | — | `public/app.js` (só `textContent`) | revisão |

## 7. Fora do escopo

- Enviar candidatura ou editar a planilha pela tela.
- Autenticação: o acesso é só da máquina local (D1 a D3).
- Mostrar ou editar o Perfil e o Currículo Base.
- Gravar Pendências: depende da Etapa `candidatura` (futura); a tela só lê o arquivo quando ele existir.

> **O que você aprendeu:** (1) o Dashboard é uma camada fina: a regra continua na CLI; (2) servidor local também precisa de defesa (Host e Origin), pois qualquer página aberta no navegador pode tentar chamá-lo; (3) cada regra EARS aponta para um cenário e um teste.
