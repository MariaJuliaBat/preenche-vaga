# Preenche Vaga

Quem procura emprego preenche os mesmos dados (nome, contato, experiência,
formação) dezenas de vezes, em sites diferentes, e isso toma horas que
poderiam ir para preparar entrevistas. O Preenche Vaga guarda o currículo
uma única vez e completa esses formulários automaticamente em poucos segundos.
A pessoa continua no controle: revisa tudo e decide quando enviar.
Assim, ela consegue se candidatar a mais vagas, com menos cansaço e menos erros de digitação.

O projeto tem **quatro partes**, que se complementam:

| Parte | O que faz | Pode enviar candidatura? |
|---|---|---|
| **Extensão Chrome** (`content/`, `popup/`) | Guarda o currículo no navegador e preenche o formulário da página aberta, quando você clica. | **Nunca.** Você revisa e envia. |
| **Pipeline** (`pipeline/`, CLI em Node.js) | Busca vagas, gera um currículo em PDF sob medida para cada uma, preenche o formulário e registra tudo na planilha. | **Só** com `AUTO_SUBMIT=true` e fora do `--dry-run`. |
| **Dashboard** (`dashboard/`, tela local) | Opera o pipeline pelo navegador, mostra os PDFs, a cota de vagas em Brasília - DF e as pendências. | Não decide nada: só dispara a CLI, sempre em simulação, salvo confirmação explícita. |
| **Assistente IA** (`pipeline/rag/`, `pipeline/agente/`, aba no Dashboard) | Agente com Gemini que consulta sua base pessoal (RAG), as vagas e o Perfil, analisa a aderência a uma vaga e rascunha respostas de formulário. | **Nunca.** Só lê e sugere. |

```
Radar ──► Currículo sob medida ──► Candidatura
(busca)    (PDF por vaga)           (preenche; envia só se autorizado)
   └────────── Planilha de Controle (Google Sheets) ◄──────────┘
Dashboard: lê output/ e chama a CLI    Extensão: independente, só preenche
```

## Regras que valem para tudo

- **Nada é enviado por acidente.** `AUTO_SUBMIT=false` é o padrão. `--dry-run` sempre vence: não envia e não escreve na planilha.
- **Termos e privacidade são seus.** O pipeline nunca marca checkbox de aceite de termos, política de privacidade/LGPD ou declaração de veracidade. Ele preenche o resto, guarda o print e deixa a vaga como **Pendência** para você aceitar e enviar.
- **Nada é inventado.** Perguntas abertas, CAPTCHA, login expirado ou campo obrigatório sem dado viram Pendência. O currículo sob medida só reorganiza fatos do seu currículo base.
- **Texto de vaga e de formulário é dado, nunca instrução.** Frases como "ignore as regras" param a candidatura.
- **Seus dados ficam com você.** Currículo real, CPF, `.env`, credenciais, `output/` e a sessão do navegador ficam fora do Git. O pipeline (Radar, currículo, candidatura) não usa LLM: é tudo determinístico, sem chave e sem custo. Só o **Assistente IA** usa o Gemini, é opcional (`GEMINI_API_KEY`) e, quando ligado, envia à API do Google os trechos da sua base de conhecimento, o Perfil sem contatos e a descrição da vaga.

---

## 1. Extensão Chrome (preencher uma página)

1. Baixe o projeto e rode `npm install`.
2. No Chrome, abra `chrome://extensions`, ligue o **Modo do desenvolvedor**,
   clique em **Carregar sem compactação** e escolha a pasta do projeto.
3. Clique no ícone do Preenche Vaga (fixe-o no quebra-cabeça 🧩 da barra).
   Escolha o seu currículo em **Importar currículo (.docx)**: a extensão lê o
   arquivo no próprio navegador e preenche os campos do popup. Revise, corrija
   o que precisar e clique em **Salvar Currículo**. Os dados ficam só no seu
   navegador, nunca no GitHub.
4. Abra o formulário da vaga, clique no ícone e em **Preencher esta página**.
5. Revise tudo e envie você mesma. A extensão nunca envia.

Para testar sem site real: `npx serve paginas-teste` e abra http://localhost:3000/formulario.html

## 2. Pipeline (de ponta a ponta)

### 2.1 Configuração, uma vez

**a) Dependências.** Node.js 22 ou mais novo (desenvolvido na 26) e Chrome ou Edge instalado (o pipeline usa o navegador para gerar o PDF e para preencher formulários). Rode `npm install`.

**b) Google Cloud (Service Account).** O pipeline lê o seu currículo (Docs) e a planilha (Sheets) com uma conta de serviço:

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto e ative as APIs **Google Docs API** e **Google Sheets API**.
2. Em *IAM e administrador → Contas de serviço*, crie uma conta de serviço e gere uma **chave JSON**.
3. Salve o arquivo em `secrets/google-service-account.json` (a pasta `secrets/` é ignorada pelo Git).
4. Abra o JSON e copie o `client_email`.

**c) Compartilhe os dois arquivos com esse e-mail:**

- o **Google Doc com o seu currículo base** → permissão de **Leitor**;
- a **Planilha de Controle** → permissão de **Editor** (o pipeline grava as vagas e atualiza o status).

A planilha precisa ter uma aba chamada **Vagas**, com o cabeçalho na **linha 4** e a vaga nº 1 na **linha 5**. Colunas: A número, B título, C link, D empresa, E origem, H, I situação (`Se candidatar` ou `Candidatura enviada`), J prazo, K status detalhado, L observações.

**d) `.env`.** Copie `.env.example` para `.env` e preencha:

| Variável | Para que serve |
|---|---|
| `GOOGLE_SHEET_URL` | Link da Planilha de Controle |
| `GOOGLE_DOC_CV_BASE_URL` | Link do Google Doc com o currículo base |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Caminho do JSON da conta de serviço (`secrets/google-service-account.json`) |
| `AUTO_SUBMIT` | `false` (padrão): preenche e não envia. `true`: envia quando não há nenhuma trava. Qualquer outro valor é erro. |
| `DADOS_COMPLEMENTARES_FILE` | Padrão `secrets/dados-complementares.json` |
| `APPLY_HEADLESS` | `true` esconde a janela do navegador na candidatura (padrão: janela visível) |
| `OUTPUT_DIR`, `BROWSER_USER_DATA_DIR` | Pastas de saída e de sessão (opcionais) |
| `PDF_BROWSER_PATH` | Caminho do Chrome/Edge, se não for encontrado sozinho (opcional) |
| `RADAR_FONTES` | Fontes do Radar, na ordem: `gupy,solides,infojobs,linkedin,indeed,github` (padrão). Ex.: `RADAR_FONTES=gupy,solides,github` |
| `RADAR_VIGENCIA_DIAS`, `MAX_VAGAS_LOTE`, `RADAR_REPOS_GITHUB`, `GITHUB_TOKEN`, `RADAR_STACK` | Ajustes do Radar (opcionais, veja o `.env.example`) |

**e) Dados complementares.** Portais pedem dados que o currículo não tem (CPF, nascimento, gênero, disponibilidade...). Copie o exemplo e preencha com os **seus** dados:

```powershell
Copy-Item dados-complementares.example.json secrets/dados-complementares.json
```

Campos aceitos: `cpf`, `dataNascimento` (`AAAA-MM-DD`), `genero`, `autodeclaracao`, `disponibilidadeInicio`, `horarioDisponivel`, `modalidadePreferida`, `pretensaoSalarial`. O arquivo é validado, fica só na sua máquina e **nunca** vai para o Git, para logs ou para a planilha. **Nunca coloque dados reais no `dados-complementares.example.json`**, que é rastreado pelo Git.

**f) Login nos portais (sessão persistente).** O pipeline não vê nem guarda sua senha: você entra à mão, uma vez, e o login fica salvo em `output/sessao-navegador/`.

```powershell
node pipeline/cli.js --login gupy      # abre o login do Gupy
node pipeline/cli.js --login indeed     # abre o login do Indeed
node pipeline/cli.js --login infojobs   # abre o login de candidatos do InfoJobs
node pipeline/cli.js --login           # janela em branco, para qualquer outro site
```

Entre normalmente e **feche a janela** ao terminar. Enquanto ela estiver aberta, o pipeline não consegue abrir a mesma sessão. O LinkedIn não tem login automatizado, de propósito, para não arriscar sua conta.

### 2.2 Comandos

Use `node pipeline/cli.js ...` ou `npm run pipeline -- ...`.

| Comando | O que faz |
|---|---|
| `--only-radar` | Busca vagas de Estágio e Júnior em TI (Gupy, Sólides, InfoJobs, LinkedIn, Indeed e repositórios do GitHub), pontua (desenvolvimento, automação e IA sobem), descarta as antigas ou suspeitas, respeita a cota de 50% em Brasília - DF e grava as aprovadas na planilha como `Se candidatar`. |
| `--only-cv` | Lê o currículo base e gera um **PDF sob medida** em `output/cvs/` para cada vaga `Se candidatar` sem CV. |
| `--only-apply` | Abre cada vaga `Se candidatar`, preenche o formulário, anexa o PDF **daquela** vaga, guarda o print em `output/receipts/` e, se tudo estiver liberado, envia. |
| `--login [gupy\|indeed\|infojobs]` | Login assistido (veja 2.1 f). Use sozinho. |
| `--dry-run` | Simula: não envia nada e não escreve na planilha. Combina com os `--only-*`. |
| sem opções | Radar, currículo e candidatura em sequência. |
| `--help` | Mostra a ajuda. |

**Sobre as fontes do Radar:**

- **Gupy** e **Sólides** usam as APIs JSON públicas das próprias páginas de busca (Brasília - DF; a Gupy também traz remoto). **InfoJobs** lê a página pública de busca de Brasília. São as fontes mais estáveis.
- **LinkedIn** usa a busca pública sem login (para não expor a sua conta), com no máximo 2 buscas por rodada, espaçadas de 4 a 5 s, e uma nova tentativa depois de 10 s se receber 429.
- **Indeed** usa um navegador e **costuma ser bloqueado** (HTTP 403, verificação anti-robô). O Radar mostra a falha e segue com as outras fontes; ele **nunca** tenta burlar a verificação nem reaproveita a sua sessão para isso. Se quiser evitar a falha no resumo, tire o Indeed: `RADAR_FONTES=gupy,solides,infojobs,linkedin,github`.
- O resumo mostra quantas vagas cada fonte entregou e quantas foram aprovadas antes do corte do lote (Brasília - DF contra remoto).
- Vagas de **Estágio e Júnior** são aceitas em qualquer área de TI (desenvolvimento, suporte, infraestrutura, redes, dados, QA, RPA, segurança...); desenvolvimento, automação e IA pontuam mais.

Recomendação para a primeira vez, sempre com `--dry-run`:

```powershell
node pipeline/cli.js --only-radar --dry-run
node pipeline/cli.js --only-cv --dry-run
node pipeline/cli.js --only-apply --dry-run
```

### 2.3 O que a candidatura faz (e quando ela para)

O motor preenche texto, listas, opções (`radio`, `select`) e anexa o PDF da vaga. Ele só **envia** quando `AUTO_SUBMIT=true`, sem `--dry-run`, sem nenhuma trava e com todos os campos obrigatórios preenchidos; e só conta como "enviada" se a tela confirmar o envio.

Ele **para como Pendência**, deixa a aba aberta (janela visível) e registra o motivo quando encontra:

| Motivo | O que você faz |
|---|---|
| aceite de termos / privacidade / veracidade | Marque você e envie |
| pergunta aberta obrigatória | Responda você |
| CAPTCHA ou verificação em duas etapas | Resolva você |
| login expirado | Rode `--login <portal>` de novo |
| campo obrigatório sem dado (ex.: sem CPF no `dados-complementares.json`) | Preencha o dado e rode de novo |
| formulário em várias etapas | Siga a partir da etapa aberta |
| texto suspeito, pedido de pagamento, domínio fora da lista | Revise a vaga com cuidado |
| `AUTO_SUBMIT=false` | Revise e envie |

Cada pendência vira uma linha em `output/logs/pendencias.jsonl`, um print em `output/receipts/` e uma atualização na planilha: coluna **I** (`Candidatura enviada` ou `Se candidatar`), **K** (status, ex.: `Pendência: aceite de termos`) e **L** (observações, com ` | CV: <arquivo> | Recibo: <arquivo>` no fim, sem apagar o que já estava).

Com a janela visível, o pipeline espera você terminar as abas com Pendência e **fechar a janela** para encerrar.

> Formulários reais de portais mudam sem aviso e muitos têm várias etapas. O motor trata a página aberta; quando não consegue ter certeza, para como Pendência em vez de arriscar.

## 3. Dashboard

```powershell
npm run dashboard      # ou: node dashboard/server.js
```

Abra http://127.0.0.1:4173 (só acessível da sua máquina).

- **Operar:** botões para o Radar, o gerador de currículos, a candidatura e o login por portal. A **Simulação** vem ligada. Para a candidatura sem simulação, a tela mostra um painel de confirmação e só roda depois do "Sim".
- **Cota DF:** quantas vagas do lote são de Brasília - DF contra a meta de 50%.
- **Currículos:** os PDFs gerados, abertos dentro da tela.
- **Auditoria:** pendências, pistas e descartes, com filtro.

- **Assistente IA:** conversa com o agente e mostra, em tempo real, o texto e as ferramentas acionadas (veja a seção 4).

O Dashboard não lê `.env`, `secrets/` nem a sessão do navegador, e a regra de envio continua só na CLI (`AUTO_SUBMIT`). A chave do Gemini é lida só pelo servidor e nunca vai para a tela.

## 4. Assistente IA, RAG e porte em ADK

Entregáveis do Projeto Final da Especialização em IA. Spec: `docs/specs/agente-e-rag.md`; visão geral e os 4 estágios de maturidade: `docs/escopo-projeto-final.md`.

**Configurar (opcional):** coloque `GEMINI_API_KEY=...` no `.env` e reinicie o Dashboard. Sem a chave, tudo continua funcionando e a aba **Assistente IA** avisa que está indisponível.

**RAG próprio (`pipeline/rag/`)**, três passos, um arquivo por passo:

| Passo | Arquivo | O que faz |
|---|---|---|
| Chunking | `fragmentar.js` | Corta `.md`/`.txt` por seção e parágrafo, com tamanho máximo e sobreposição configuráveis |
| Embedding | `vetorizar.js`, `indice.js` | Vetores do Gemini (`gemini-embedding-001`), com cache por hash em `output/rag-index.json`; sem chave, vetorizador local determinístico |
| Retrieval | `buscar.js` | Similaridade de cosseno: os `topK` trechos com `score` e fonte |

A base de exemplo (fictícia, no Git) está em `docs/base-conhecimento-exemplo/`. Para usar a sua, crie `secrets/base-conhecimento/` com arquivos `.md`/`.txt`: ela é lida junto e nunca vai para o Git.

**Agente (`pipeline/agente/`)**, com as 4 capacidades:

- **System Prompt** dedicado (`prompt.js`): só fatos da base e do Perfil, nada inventado.
- **Tool Calling** (`ferramentas.js`): `consultar_base_pessoal`, `consultar_vagas_planilha`, `analisar_vaga_e_curriculo`. Todas só leem.
- **Structured Output** (`analise.js`): análise de aderência (score, pontos fortes com evidência, lacunas e rascunho de resposta) validada por Zod; ponto forte sem evidência na base é removido (Ancoragem).
- **Streaming**: `POST /api/assistente` (SSE) alimenta a aba **Assistente IA**.

**Porte em Google ADK (`agente-adk/`)**: o mesmo agente com `LlmAgent` e `FunctionTool`, reaproveitando as ferramentas do projeto.

```powershell
cd agente-adk
npm install
npm test                                        # LLM falso: sem chave, sem rede
node src/cli.js "O que já fiz com automação?"   # usa a GEMINI_API_KEY do .env
```

**n8n:** a arquitetura do fluxo equivalente está em `n8n/README.md` (o JSON exportado é salvo ali).

## 5. Desenvolvimento

```powershell
npm test            # testes (usam só dados fictícios; os de navegador são pulados sem Chrome/Edge; nenhum precisa de GEMINI_API_KEY)
npm run lint
npm run typecheck
```

| Pasta | Conteúdo |
|---|---|
| `content/`, `popup/`, `manifest.json` | Extensão Chrome (Manifest V3, JavaScript puro, sem build). `content/mapeamento.js` é o **único** lugar dos sinônimos de campo, usado também pelo pipeline. |
| `pipeline/` | CLI: `radar/`, `perfil/`, `curriculo/`, `apply/` (sessão, motor, travas), `sheets.js`, `config.js` |
| `pipeline/rag/`, `pipeline/agente/` | RAG próprio e Agente Assistente (Gemini) |
| `dashboard/` | Servidor e tela locais (inclui a aba Assistente IA) |
| `agente-adk/`, `n8n/` | Porte do agente em Google ADK e documentação do fluxo n8n |
| `paginas-teste/` | Formulários falsos para testar sem site real |
| `docs/specs/` | Specs (EARS + Gherkin) de cada parte: `preenchimento-automatico`, `pipeline-candidatura`, `radar-de-vagas`, `perfil-e-curriculo`, `dashboard`, `auto-apply`, `agente-e-rag` |
| `output/`, `secrets/`, `.env` | Gerados e privados: **fora do Git** |

Regras do repositório: nunca commitar currículo real, CPF ou credenciais; testes só com dados fictícios; a extensão nunca chama `.submit()` nem clica em botão de envio.

## 6. Privacidade e responsabilidade

Tudo roda na sua máquina. O que vai para o Google é a leitura do seu Doc e a escrita na sua planilha, pela sua própria conta de serviço, e, **só se você ativar o Assistente IA**, o texto das perguntas, os trechos da base de conhecimento, o Perfil sem contatos e a descrição da vaga enviados à API do Gemini. CPF, nascimento e dados de `dados-complementares` nunca entram. Respeitar os termos de uso de cada site de vagas é responsabilidade sua: automatize só onde você se sente segura, e prefira o `--dry-run` até confiar no resultado.
