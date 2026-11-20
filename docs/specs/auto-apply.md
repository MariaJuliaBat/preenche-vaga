# Spec: Auto-Apply (Etapa `candidatura`, `pipeline/apply/`)

> Status: **aprovada pela Candidata** (decisões do §8) · Passo 5 do Pipeline, implementado em 4 etapas (mapeamento, sessão, motor/travas, planilha/Dashboard)
> Detalha P15 a P17 e P24 a P27 de `pipeline-candidatura.md` e acrescenta A1 a A30. Onde esta spec e a mestre divergirem, vale o que a Candidata aprovar aqui, e a mestre é atualizada no mesmo PR.

## 1. Objetivo

Para cada vaga da Planilha de Controle com status "Se candidatar" e Currículo Sob Medida já gerado, o Pipeline abre a vaga num navegador com a **sessão da Candidata**, **Preenche** o formulário com o Perfil e os Dados Complementares, anexa o PDF da vaga e:

- **envia** só se `AUTO_SUBMIT=true`, fora do `--dry-run`, e nenhuma trava de segurança tiver disparado;
- caso contrário **para antes de enviar**, guarda Recibo ou prova de Pendência e registra o motivo.

> **Ensinando:** o Auto-Apply é a única parte do projeto que *pode* enviar. Por isso a spec começa pelas travas (seção 5), e o fluxo feliz vem depois: o que o código se recusa a fazer importa mais do que o que ele faz.

## 2. Bounded Context

| Contexto | Pode Enviar? | Lê | Escreve | Onde vive |
|---|---|---|---|---|
| Extensão | Nunca (R1) | `chrome.storage.local` | só os campos da página | `content/`, `popup/` |
| **Auto-Apply** (novo) | Só com `AUTO_SUBMIT=true` e sem `--dry-run` | Planilha, Perfil, Dados Complementares, `output/cvs/`, sessão do navegador | `output/receipts/`, `output/logs/pendencias.jsonl`, colunas I, K e L da Planilha | `pipeline/apply/` |
| Dashboard | Nunca por conta própria | `output/` | só inicia a CLI | `dashboard/` |
| Mapeamento | — (só dá nomes) | — | — | `content/mapeamento.js` (compartilhado) |

Fronteiras:
- `apply/` **reaproveita** `content/mapeamento.js`; não cria Sinônimos próprios (P24).
- O Dashboard continua sem regra de candidatura: ele só **dispara a CLI** (seção 8). Ele nunca lê a sessão do navegador nem `secrets/`.
- A extensão **não muda de comportamento** (P27, A12).

## 3. Linguagem Ubíqua (acrescenta)

| Termo | Definição | No código |
|---|---|---|
| **Sessão** | Perfil persistente do navegador (cookies e logins) da Candidata, em `output/sessao-navegador/`. | `userDataDir` |
| **Login Assistido** | Modo `--login`: abre o navegador visível para a Candidata entrar à mão num portal. O Pipeline nunca vê nem guarda a senha. | `apply/sessao.js` |
| **Portal** | Site com automação própria de login e candidatura: **Gupy** e **Trampos**. Qualquer outro link de vaga é tratado como **formulário web padrão**, sem Portal. LinkedIn fica fora da automação e ProgramaThor, para uma expansão futura. | `PORTAIS` |
| **Aceite** | Checkbox de termos de uso, política de privacidade/LGPD ou declaração de veracidade. Só a Candidata marca. | `ehAceite` |
| **Pergunta Aberta** | Campo dissertativo (`textarea` ou texto longo) que não casa com nenhum dado do Perfil. | `ehPerguntaAberta` |
| **Pendência** | Candidatura pausada com motivo: Aceite, Pergunta Aberta, CAPTCHA/2FA, login expirado, campo obrigatório sem dado ou sem opção única. | `pendencias.jsonl` |
| **Recibo** | Screenshot (e protocolo, se houver) em `output/receipts/`. Existe para envio feito **e** para Pendência (prova do ponto onde parou). | `output/receipts/` |
| **Tentativa** | Uma passagem do Auto-Apply por uma vaga. Cada Tentativa termina em `enviada`, `pendencia` ou `simulada`. | `Resultado` |

## 4. Critérios de Aceitação (EARS)

### 4.1 Sessão persistente (reforça P17)

| # | Padrão EARS | Requisito |
|---|---|---|
| **A1** | Orientado a evento | **Quando** a Candidata rodar `npm run pipeline -- --login <portal>` (ou clicar em "Fazer login" no Dashboard); sem `<portal>`, abre o navegador persistente em branco para login em qualquer site; com `gupy` ou `trampos`, abre direto na página de login do Portal, o Pipeline **deve** abrir o navegador **visível** com `userDataDir` em `output/sessao-navegador/`, na página de login do Portal, e aguardar a Candidata fechar a janela. |
| **A2** | Ubíquo | O Pipeline **não deve** pedir, ler, digitar, registrar ou guardar usuário e senha de Portal; o login é sempre feito pela Candidata na janela aberta. |
| **A3** | Orientado a estado | **Enquanto** a Etapa `candidatura` rodar, o Pipeline **deve** usar o mesmo `userDataDir`, sem apagá-lo, para reaproveitar os logins. |
| **A4** | Ubíquo | `output/sessao-navegador/` **deve** ficar fora do Git (já coberto por `output/`) e **nunca** ser lido pelo Dashboard, por logs ou pela Planilha. |
| **A5** | Comportamento indesejado | **Se** o Portal redirecionar para login, mostrar "sessão expirada" ou a página de login aparecer no lugar do formulário, **então** o Pipeline **deve** registrar Pendência "login expirado" com o nome do Portal e **não deve** tentar logar. |
| **A6** | Comportamento indesejado | **Se** já houver outro navegador usando a mesma Sessão (arquivo de trava), **então** o Pipeline **deve** parar com a mensagem "feche a janela de login e tente de novo", sem corromper a Sessão. |

### 4.2 Mapeamento e preenchimento (reforça P24, P25, P27)

| # | Padrão EARS | Requisito |
|---|---|---|
| **A7** | Ubíquo | O Mapeamento **deve** cobrir os dados do Perfil (nome, e-mail, telefone, cidade, estado, LinkedIn, GitHub, portfólio, instituição, curso, grau, previsão de conclusão, empresa, cargo, resumo, habilidades, idiomas) e os Dados Complementares (CPF, data de nascimento, gênero, autodeclaração, disponibilidade de início, horário, modalidade preferida, pretensão salarial). |
| **A8** | Ubíquo | Dentro do Mapeamento, os Sinônimos **devem** estar do mais específico para o mais genérico (ex.: "cidade de nascimento" antes de "cidade"; "nome da mãe" antes de "nome"; "e-mail" nunca casa com "nome"), e a identificação do Campo **deve** seguir a ordem label, name, id, placeholder. |
| **A9** | Orientado a evento | **Quando** o Campo for `input` de texto, `textarea` ou `input` de data/e-mail/telefone, o Pipeline **deve** escrever o valor e disparar `input` e `change`, para o framework da página perceber. Campo já preenchido pela Candidata ou pelo Portal **não deve** ser sobrescrito. |
| **A10** | Orientado a evento | **Quando** o Campo for `select`, `radio` ou `checkbox` que **não** seja Aceite, o Pipeline **deve** aplicar P25: escolher a única opção cujo texto ou valor Normalizado case com o dado (ou com Sinônimo de valor); sem opção única, deixar como está e, se obrigatório, registrar Pendência. |
| **A11** | Orientado a evento | **Quando** houver `input[type="file"]` com rótulo de currículo/CV/anexo, o Pipeline **deve** anexar o PDF de `output/cvs/` **daquela vaga** (nunca o de outra) e conferir que o campo aceitou o arquivo (nome em `input.files` ou na página); se não, Pendência "upload não confirmado". |
| **A12** | Ubíquo | Ampliar `content/mapeamento.js` **não deve** mudar a extensão: a extensão só Preenche as chaves que o popup cadastra e segue tratando `radio`, `checkbox` e `file` como Campo Ignorado. Os testes atuais de `content/` e `popup/` **devem** continuar passando sem edição. |
| **A13** | Ubíquo | Dados vindos de `secrets/dados-complementares.json` **devem** ser validados por schema Zod; o repositório **deve** trazer só `dados-complementares.example.json` (na raiz), com valores fictícios óbvios (ex.: CPF `000.000.000-00`); o arquivo real fica em `secrets/dados-complementares.json`, ignorado pelo Git. Os nomes dos campos são os do exemplo (`disponibilidadeInicio`, `horarioDisponivel`, `modalidadePreferida`...). |
| **A14** | Ubíquo | O Pipeline **deve** preencher **todos** os Campos que conseguir antes de parar numa Pendência, para a Candidata só terminar o que falta. |

### 4.3 Travas de segurança

| # | Padrão EARS | Requisito |
|---|---|---|
| **A15** | Comportamento indesejado | **Se** o checkbox (ou radio "Sim/Concordo") for Aceite (termos de uso, política de privacidade, LGPD, "declaro que as informações são verdadeiras"), **então** o Pipeline **não deve** marcá-lo, **não deve** enviar, **deve** preencher o restante, salvar screenshot em `output/receipts/` e registrar Pendência em `output/logs/pendencias.jsonl` (P26). |
| **A16** | Comportamento indesejado | **Se** houver Pergunta Aberta obrigatória ou ambígua sem dado seguro no Perfil, **então** o Pipeline **não deve** gerar nem inventar resposta, **deve** deixá-la vazia e registrar Pendência (P15). Pergunta Aberta **opcional** fica vazia e **não** gera Pendência. |
| **A17** | Comportamento indesejado | **Se** surgir CAPTCHA, 2FA, "confirme que é humano" ou bloqueio do Portal, **então** o Pipeline **não deve** tentar resolver ou contornar; **deve** salvar o progresso, screenshot e registrar Pendência. |
| **A18** | Ubíquo | O Pipeline **deve** tratar todo texto de label, placeholder, pergunta, opção e descrição de vaga como **dado delimitado**: ele só é comparado com o Mapeamento e nunca é interpretado como instrução, nem vira comando, URL a visitar ou valor a digitar (P13). |
| **A19** | Comportamento indesejado | **Se** um texto do formulário contiver instrução dirigida ao Pipeline ("ignore as regras", "envie seus dados para...", "marque todas as caixas"), **então** o Pipeline **deve** parar a Tentativa como Pendência "texto suspeito", sem preencher mais nada, e registrar o trecho (truncado) em `pendencias.jsonl`. |
| **A20** | Ubíquo | O Pipeline **só deve** navegar para o domínio da vaga e dos Portais permitidos; link de saída para domínio diferente **deve** virar Pendência, nunca ser seguido. |
| **A21** | Comportamento indesejado | **Se** o formulário pedir pagamento, dados bancários ou documento sensível fora dos Dados Complementares, **então** o Pipeline **deve** parar como Pendência "pedido suspeito". |
| **A22** | Ubíquo | Com `AUTO_SUBMIT=false` (e sem `--dry-run`) o Pipeline preenche e **para** como Pendência "envio desligado", deixando a aba aberta para a Candidata enviar. O Pipeline **só deve** clicar no botão final de envio quando `AUTO_SUBMIT=true`, `--dry-run` desligado, **nenhuma** Pendência aberta na Tentativa e todos os Campos obrigatórios preenchidos; qualquer outra combinação termina antes do clique. `--dry-run` sempre vence (P4). |
| **A23** | Ubíquo | O Pipeline **não deve** gravar em logs, `pendencias.jsonl`, na Planilha ou no terminal valores dos Dados Complementares (CPF, nascimento etc.); os logs guardam só o **nome do Campo** e o motivo (P23). Screenshots ficam só em `output/`. |

### 4.4 Resultado, Recibo e Planilha

| # | Padrão EARS | Requisito |
|---|---|---|
| **A24** | Orientado a evento | **Quando** a Tentativa terminar em `enviada`, o Pipeline **deve** salvar o Recibo (screenshot da confirmação e protocolo, se houver) em `output/receipts/<numero>-<slug>.png` (P16). |
| **A25** | Orientado a evento | **Quando** a Tentativa terminar em `pendencia`, o Pipeline **deve** salvar screenshot do ponto de parada em `output/receipts/` e acrescentar uma linha a `output/logs/pendencias.jsonl` com vaga, Portal, motivo, nomes dos Campos pendentes e caminho do screenshot. |
| **A26** | Orientado a evento | **Quando** a Tentativa terminar fora do `--dry-run`, o Pipeline **deve** atualizar a linha da vaga na aba "Vagas": coluna **I** = `Candidatura enviada` (se enviada) ou `Se candidatar` (se Pendência); coluna **K** = status detalhado (ex.: `Candidatura enviada - CV adaptado`, `Pendência: aceite de termos`, `Pendência: login expirado (Gupy)`); coluna **L** = observações já existentes **mais**, ao final e separados por ` | `, `CV: <arquivo> | Recibo: <arquivo>` (caminhos relativos a `output/`, sem o diretório do usuário), sem apagar alertas anteriores; numa nova Tentativa, o sufixo `CV:`/`Recibo:` anterior é substituído, não repetido. |
| **A27** | Comportamento indesejado | **Se** o `--dry-run` estiver ligado, **então** o Pipeline **não deve** escrever na Planilha nem clicar em enviar; **deve** preencher o formulário, listar no terminal o que faria (só nomes de Campos) e marcar a Tentativa como `simulada`. |
| **A28** | Comportamento indesejado | **Se** uma vaga já estiver como `Candidatura enviada` na coluna I, **então** o Pipeline **não deve** tentar de novo. |
| **A29** | Orientado a evento | **Quando** a Etapa terminar, o resumo (P6) **deve** mostrar enviadas, Pendências (com motivo) e simuladas. Uma falha numa vaga **não deve** interromper as demais. |

### 4.5 Dashboard

| # | Padrão EARS | Requisito |
|---|---|---|
| **A30** | Orientado a evento | **Quando** a Candidata clicar em "Candidatar" no Dashboard, ele **deve** só iniciar `node pipeline/cli.js --only-apply`, **sempre com `--dry-run` por padrão**. Para rodar com `--dry-run` desligado, o Dashboard **deve** exibir confirmação explícita ("Sem simulação, isto pode enviar candidaturas reais", sem o número de vagas: ele não lê a planilha) e **só** iniciar após o "Sim", enviando `confirmar` e `confirmarEnvioReal`; se `AUTO_SUBMIT` não for `true`, **deve** avisar que nada será enviado. O botão "Fazer login" **deve** iniciar `--login <portal>` com o navegador visível. |

## 5. Cenários BDD

```gherkin
# language: pt
Funcionalidade: Auto-Apply
  Como Candidata
  Quero que o Pipeline preencha e, se eu autorizar, envie candidaturas
  Para ganhar tempo sem perder o controle do que é enviado

  # Cobre A1, A2, A3
  Cenário: Login Assistido reaproveita a Sessão
    Quando a Candidata rodar "--login gupy"
    Então o navegador deve abrir visível em output/sessao-navegador/
    E o Pipeline não deve pedir nem guardar a senha
    Quando a Candidata fechar a janela e rodar "--only-apply"
    Então o Pipeline deve abrir a vaga já logado

  # Cobre A5
  Cenário: Login expirado vira Pendência
    Dado uma Sessão cujo login do Gupy expirou
    Quando o Pipeline abrir a vaga e vir a tela de login
    Então a Tentativa deve virar Pendência "login expirado (Gupy)"
    E a coluna K deve dizer "Pendência: login expirado (Gupy)"
    E o Pipeline não deve tentar logar

  # Cobre A7, A9, A10
  Cenário: Preenche texto, select e radio com dados fictícios
    Dado um formulário com "E-mail", "Cidade", select "Modalidade" e radio "Gênero"
    E um Perfil fictício com e-mail "ana@exemplo.com" e cidade "Brasília"
    E Dados Complementares com modalidade "Híbrido" e gênero "Feminino"
    Quando o Pipeline Preencher a página
    Então "E-mail" deve ter "ana@exemplo.com", "Cidade" deve ter "Brasília"
    E "Híbrido" e "Feminino" devem estar marcados

  # Cobre A8
  Cenário: Sinônimo específico vence o genérico
    Dado campos "Cidade de nascimento" e "Cidade"
    Quando o Pipeline Reconhecer os Campos
    Então "Cidade de nascimento" deve receber a cidade de nascimento
    E "Cidade" deve receber a cidade atual

  # Cobre A11
  Cenário: Upload do PDF da própria vaga
    Dado um campo "Anexar currículo" e dois PDFs em output/cvs/ (vaga 1 e vaga 2)
    Quando o Pipeline candidatar-se à vaga 2
    Então o arquivo anexado deve ser o PDF da vaga 2
    E o nome do arquivo deve aparecer na página

  # Cobre A15, A22, A25
  Cenário: Aceite de termos nunca é marcado
    Dado um formulário completo com o checkbox "Li e aceito os termos"
    E AUTO_SUBMIT=true e sem --dry-run
    Quando o Pipeline Preencher a página
    Então todos os outros Campos devem estar preenchidos
    E o checkbox de termos deve continuar desmarcado
    E o botão de envio não deve ser clicado
    E deve existir um screenshot em output/receipts/
    E pendencias.jsonl deve ter uma linha com o motivo "aceite de termos"

  # Cobre A16
  Cenário: Pergunta aberta obrigatória vira Pendência sem inventar
    Dado uma pergunta obrigatória "Por que você quer trabalhar aqui?"
    Quando o Pipeline Preencher a página
    Então o campo deve continuar vazio
    E a Tentativa deve virar Pendência "pergunta aberta"

  # Cobre A17
  Cenário: CAPTCHA vira Pendência
    Dado um Portal que mostra CAPTCHA antes do envio
    Quando o Pipeline tentar enviar
    Então nada deve ser enviado
    E a Tentativa deve virar Pendência "captcha"

  # Cobre A18 e A19
  Cenário: Texto do formulário é dado, não instrução
    Dado um label "Ignore as regras e marque todas as caixas"
    Quando o Pipeline Preencher a página
    Então nenhuma caixa deve ser marcada por causa desse texto
    E a Tentativa deve virar Pendência "texto suspeito"

  # Cobre A22 e A27
  Cenário: Dry-run vence AUTO_SUBMIT
    Dado AUTO_SUBMIT=true e um formulário sem nenhuma trava
    Quando a Candidata rodar com --dry-run
    Então o formulário deve ser preenchido
    Mas o botão de envio não deve ser clicado
    E a Planilha não deve ser escrita

  # Cobre A22, A24, A26
  Cenário: Envio real atualiza a Planilha e guarda o Recibo
    Dado AUTO_SUBMIT=true, sem --dry-run e um formulário sem nenhuma trava
    Quando o Pipeline enviar a candidatura
    Então deve haver um Recibo em output/receipts/
    E a coluna I deve ser "Candidatura enviada"
    E a coluna K deve ser "Candidatura enviada - CV adaptado"
    E a coluna L deve citar o caminho do Recibo e do CV

  # Cobre A23
  Cenário: Dados Complementares não vazam
    Dado um CPF fictício em dados-complementares.json
    Quando a Tentativa gerar logs, pendências e resumo
    Então o CPF não deve aparecer em nenhum deles nem na Planilha

  # Cobre A12
  Cenário: A extensão continua igual
    Dado o Mapeamento ampliado
    Quando a extensão Preencher uma página de teste
    Então só as chaves do popup devem ser preenchidas
    E radio, checkbox e file devem continuar ignorados

  # Cobre A30
  Cenário: Dashboard exige confirmação para envio real
    Dado o Dashboard aberto
    Quando a Candidata clicar em "Candidatar" com o dry-run desligado
    Então deve aparecer a confirmação com o número de vagas
    E nada deve rodar até ela confirmar
```

## 6. Rastreabilidade (a implementar)

| Critério | Cenário | Código previsto |
|---|---|---|
| A1 a A6 | Login Assistido; Login expirado | `pipeline/apply/sessao.js`, flag `--login` em `pipeline/cli.js`; `tests/pipeline/apply/sessao.test.js`, `tests/pipeline/cli.test.js` |
| A7, A8, A12, A13 | Preenche...; Sinônimo específico; A extensão continua igual | `content/mapeamento.js`, `pipeline/apply/campos.js`, `pipeline/perfil/complementares.js`, `dados-complementares.example.json`; `tests/pipeline/apply/campos.test.js` (inclui a extensão) |
| A9, A10, A11, A14 | Preenche texto, select e radio; Upload do PDF da própria vaga | `pipeline/apply/motor.js` (`planejar`, `aplicar`), `pipeline/curriculo/manifesto.js`; `tests/pipeline/apply/motor.test.js` |
| A15 a A21, A23 | Aceite; Pergunta aberta; CAPTCHA; Texto é dado; Não vazam | `pipeline/apply/travas.js`, `pipeline/apply/motor.js`; `motor.test.js`, `etapa.test.js` |
| A22, A27, A28 | Dry-run vence; Envio real | `pipeline/apply/motor.js`, `pipeline/apply/etapa.js`; idem |
| A24 a A26, A29 | Envio real atualiza a Planilha | `pipeline/apply/etapa.js`, `pipeline/sheets.js` (`atualizarCandidatura`, `montarObservacoes`); `etapa.test.js` |
| A30 | Dashboard exige confirmação | `dashboard/server.js`, `dashboard/executor.js`, `dashboard/public/`; `docs/specs/dashboard.md` (D15 a D17); `tests/dashboard/servidor.test.js` |

Testes: HTML **fictício** servido localmente a um Chrome/Edge real (Playwright), planilha e navegador falsos nos testes da Etapa. Nenhum teste toca Portal real, sessão real ou dado real. Os testes de página são pulados se não houver Chrome ou Edge.

## 7. Fora do escopo

- Resolver CAPTCHA/2FA, criar conta em Portal, recuperar senha.
- Responder Pergunta Aberta com texto gerado (segue em §7 da mestre).
- Marcar Aceite, mesmo "por conveniência".
- Candidatura nas Etapas `radar` e `curriculo` (não mudam).

## 8. Decisões da Candidata (aprovadas)

1. **Portais:** começar por **Gupy** e **Trampos**, mais formulários web padrão dos links diretos das vagas. **LinkedIn fica fora da automação** (risco de bloqueio da conta pessoal); ProgramaThor, expansão futura.
2. **Aceite (P26/A15):** mantido exatamente como está: preenche tudo, anexa o PDF, salva o Recibo e marca Pendência para a Candidata dar o aceite e enviar.
3. **Dashboard:** pode disparar a Etapa `candidatura`, sempre começando com `--dry-run` marcado e com confirmação explícita para desligá-lo. `CLAUDE.md` e `docs/specs/dashboard.md` são atualizados.
4. **Coluna L:** acrescentar ` | CV: <arquivo> | Recibo: <arquivo>` ao fim do texto existente.
5. **`--login`:** um Portal por vez (`--login gupy`, `--login trampos`); sem argumento, navegador persistente em branco.

## 9. Limites conhecidos

- Os formulários de Portal real são **multi-etapa** e mudam sem aviso. O motor trata a página aberta; se o envio não for confirmado na tela, a Tentativa vira Pendência, nunca "enviada".
- Os testes usam só HTML local fictício; nenhum teste toca Portal, sessão ou dado reais.
