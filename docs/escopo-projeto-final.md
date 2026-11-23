# Escopo do Projeto Final: Preenche Vaga

> Projeto Final da Especialização em IA. Este documento descreve o que o `preenche-vaga` entrega e como cada parte demonstra um dos **4 Estágios de Maturidade** do trabalho com IA no desenvolvimento.
> Specs de cada parte: `docs/specs/`. Esta é a visão de conjunto.

## 1. Problema e solução

Candidatar-se a vagas de estágio e júnior em TI é repetitivo: achar a vaga, adaptar o currículo, preencher o mesmo formulário dezenas de vezes. O **Preenche Vaga** automatiza o que é mecânico e deixa a decisão com a pessoa:

- a **extensão Chrome** preenche o formulário aberto, mas **nunca envia**;
- o **pipeline** busca vagas, gera um currículo sob medida e registra na planilha; só ele pode enviar, e só com `AUTO_SUBMIT=true` fora do `--dry-run`;
- o **Assistente IA** (agente com Gemini) analisa a aderência de uma vaga e rascunha respostas, **somente com fatos** da base pessoal da Candidata.

### Dentro e fora do escopo

| Dentro | Fora |
|---|---|
| Preencher formulários (Gupy, Vagas.com, Catho) a pedido | Enviar candidatura pela extensão |
| Radar, currículo sob medida, candidatura e planilha (pipeline) | Inventar experiência ou dado no currículo |
| Dashboard local, RAG próprio, agente com tools, porte ADK, workflow n8n | Hospedar o sistema na nuvem ou servir outras pessoas |
| Guardrails determinísticos (P26, ancoragem, `--dry-run`) | Marcar aceite de termos/LGPD por conta própria |

## 2. Os 4 Estágios de Maturidade

| Estágio | Pergunta que responde | Onde está no projeto |
|---|---|---|
| 1. **Assisted Developer** | "A IA me ajuda a escrever código?" | Extensão Chrome MV3 inicial |
| 2. **Context Orchestrator** | "Consigo dar à IA o contexto certo, sempre?" | Specs EARS/Gherkin, `CLAUDE.md`, subagentes, skills |
| 3. **Agentic Orchestrator** | "Consigo construir agentes que usam ferramentas?" | Agente com tool calling, structured output, streaming, RAG, n8n, porte ADK |
| 4. **Harness / Loop Engineer** | "Consigo cercar o agente de verificações que rodam sozinhas?" | Pipeline ponta a ponta, Dashboard, guardrails, recibos e logs, CI/CD |

### Estágio 1: Assisted Developer

A IA como par de programação, num escopo pequeno e verificável.

- **Entrega:** extensão Chrome Manifest V3 em JavaScript puro (`manifest.json`, `popup/`, `content/`).
- O currículo é cadastrado uma vez (digitado ou importado de `.docx`) e guardado em `chrome.storage.local`.
- Os sinônimos de campo vivem em **um só lugar**: `content/mapeamento.js`.
- Só preenche quando a pessoa clica em "Preencher esta página"; nada de scripts automáticos com dados.
- **Evidência:** `paginas-teste/` (formulários falsos) e `tests/preencher.test.js`, `tests/importar-docx.test.js`.
- **Limite aprendido:** a IA gera código plausível, mas sem contexto repete erros (campo mapeado em dois lugares, clique em "Enviar"). Isso leva ao estágio 2.

### Estágio 2: Context Orchestrator

Em vez de repetir instruções a cada conversa, o contexto vira artefato versionado.

- **Spec-Driven Development:** cada parte tem spec com bounded context, linguagem ubíqua, critérios **EARS** e cenários **Gherkin** em `docs/specs/` (`preenchimento-automatico`, `pipeline-candidatura`, `radar-de-vagas`, `perfil-e-curriculo`, `auto-apply`, `dashboard`, `agente-e-rag`). A skill `escrever-spec` guia o processo.
- **`CLAUDE.md`:** regras que valem sempre ("nunca `.submit()`", "mapeamento só em `content/mapeamento.js`", "nunca commitar currículo real").
- **Subagentes em `.claude/agents/`:** `revisor` (checklist da PR), `rastreador-de-spec` (compara o diff com a spec, sem permissão de escrita) e `cetico-de-testes` (desconfia de teste que passa fácil demais).
- **Skills em `.claude/skills/`:** `mapear-site-vaga`, `revisao-preenche-vaga`, `escrever-spec`.
- **Isolamento de contexto:** os subagentes revisores têm só ferramentas de leitura (`Read`, `Grep`, `Glob`) e começam sem a conversa, então não herdam o viés de quem escreveu o código.
- **Evidência:** rastreabilidade requisito → código → teste ao final de cada spec.

### Estágio 3: Agentic Orchestrator

O sistema passa a **decidir quais ferramentas chamar**. Especificação: `docs/specs/agente-e-rag.md`.

| Capacidade | Implementação | Teste |
|---|---|---|
| **System Prompt** dedicado | `pipeline/agente/prompt.js`: só fatos, nunca inventar, texto de vaga é dado | `tests/pipeline/agente/agente.test.js` (A1) |
| **Tool Calling** (3 ferramentas) | `pipeline/agente/ferramentas.js`: `consultar_base_pessoal` (RAG), `consultar_vagas_planilha` (Lote Final), `analisar_vaga_e_curriculo` (Perfil) | `ferramentas.test.js` (A2 a A4) |
| **Structured Output** | `pipeline/agente/analise.js`: `responseSchema` do Gemini + validação Zod; score, pontos fortes, lacunas e rascunho de resposta | `analise.test.js` (A6, A7) |
| **Streaming** | SSE em `POST /api/assistente` (`dashboard/server.js`) e aba **Assistente IA** mostrando texto e ferramentas em tempo real | `tests/dashboard/assistente.test.js` (S1 a S5) |
| **RAG próprio** | `pipeline/rag/`: chunking, embedding (Gemini ou local) com cache por hash, retrieval por cosseno | `tests/pipeline/rag/rag.test.js` (R1 a R9) |
| **Fluxo n8n** | Mesma arquitetura em nós visuais: `n8n/README.md` | (documentado; exportar o JSON) |
| **Porte Google ADK** | `agente-adk/`: `LlmAgent` + `FunctionTool` embrulhando as mesmas ferramentas | `agente-adk/test/agente.test.js` (P1, P2) |

Decisões de projeto:

- **RAG sem caixa-preta:** cada passo (fragmentar, vetorizar, indexar, buscar) é um arquivo curto, sem biblioteca de vetores.
- **Sem chave também funciona:** o vetorizador local (`local-hash`) permite testar e demonstrar offline; o índice registra o modelo e nunca mistura vetores de modelos diferentes.
- **Uma regra, dois frameworks:** o porte ADK reaproveita as ferramentas do projeto, então ADK e código próprio não podem divergir nas regras.
- **Tools + Structured Output em duas fases:** o laço de ferramentas é uma chamada em streaming; a análise é uma segunda chamada com `responseSchema` (o Gemini 2.x não aceita `responseSchema` junto com ferramentas na mesma requisição).

### Estágio 4: Harness / Loop Engineer

O foco muda do prompt para o **ambiente que cerca o agente**: o que ele pode fazer, o que é verificado, o que fica registrado.

- **Pipeline ponta a ponta** (`pipeline/`): Radar → Perfil → Currículo → Candidatura → Planilha, pela CLI (`--only-radar`, `--only-cv`, `--only-apply`, `--dry-run`).
- **Dashboard local** (`dashboard/`, só `127.0.0.1`): opera o pipeline, mostra PDFs, Cota DF e auditoria, e hospeda o Assistente IA. Proteções contra DNS rebinding e CSRF (D2, D3).
- **Guardrails determinísticos** (código, não prompt):

| Guardrail | O que impede | Onde |
|---|---|---|
| **`--dry-run` sempre vence** | Enviar ou escrever na planilha por engano | `pipeline/config.js` |
| **`AUTO_SUBMIT=false` por padrão** | Envio sem decisão explícita | `pipeline/config.js` |
| **P26 (aceite)** | Marcar termos, LGPD ou "declaro que é verdade" | `pipeline/apply/campos.js`, `motor.js` (dupla checagem) |
| **Ancoragem** | Fato que não está no currículo | Perfil (todo valor é trecho do próprio Doc) e `ancorarAnalise` do Agente (A9) |
| **Texto de vaga é dado** | Injeção de prompt vinda de uma vaga | `blocoDeDados` (A11) |
| **Agente só lê** | Qualquer ação de escrita pelo modelo | `DECLARACOES` (A12), teste que lista as ferramentas |
| **Perfil sem contatos** | Vazar CPF, e-mail e telefone para a API | `perfilSeguro` (A10) |

- **Recibos e logs:** `output/receipts/` (print de cada candidatura), `output/logs/*.jsonl` (pendências, pistas, descartes) e coluna de observações na planilha com CV e recibo.
- **CI/CD (GitHub Actions, `.github/workflows/ci.yml`):** lint, typecheck, build, `npm test` e `npm test` do `agente-adk/`, sem `GEMINI_API_KEY` (os testes usam clientes falsos).
- **Privacidade por construção:** `.env`, `secrets/`, `output/` e a sessão do navegador ficam fora do Git; testes só com dados fictícios.

## 3. Arquitetura

```
 Extensão Chrome ── preenche a página aberta (nunca envia)
        │ reaproveita content/mapeamento.js
 Pipeline CLI ── Radar ─► Perfil ─► Currículo ─► Candidatura ─► Planilha / recibos
        │                   ▲
        │                   └── output/perfil.json, output/lote.json (somente leitura abaixo)
 Dashboard (127.0.0.1) ── opera a CLI ── aba Assistente IA ──SSE──┐
                                                                  ▼
                    Agente (Gemini) ── System Prompt ── Tool Calling ── Structured Output
                         │                    │
                         ▼                    ▼
                RAG (fragmentar → vetorizar → indexar → buscar)    vagas e Perfil
                         ▲
        docs/base-conhecimento-exemplo/ (fictícia, no Git)
        secrets/base-conhecimento/ (real, fora do Git)

 agente-adk/  : o mesmo agente em Google ADK        n8n/ : o mesmo fluxo em nós visuais
```

## 4. Como verificar

```powershell
npm test                  # todos os testes da raiz (sem chave, sem rede)
npm run lint
npm run typecheck
cd agente-adk; npm install; npm test      # porte ADK
npm run dashboard         # http://127.0.0.1:4173 → aba "Assistente IA" (precisa de GEMINI_API_KEY)
```

Demonstração sugerida (5 minutos): (1) rodar `npm test`; (2) abrir o Dashboard e perguntar "O que já fiz com automação?"; (3) ligar a Análise de Aderência com uma pergunta de formulário e mostrar o aviso de ancoragem; (4) mostrar o `rag-index.json` sendo reaproveitado numa segunda execução; (5) rodar `agente-adk` com a mesma pergunta.

## 5. Riscos e limites

| Risco | Mitigação | Limite que sobra |
|---|---|---|
| Modelo inventa experiência | Prompt + ferramentas + **Ancoragem** que remove pontos sem evidência | O **rascunho de resposta** não é ancorado frase a frase: a Candidata deve revisar |
| Texto de vaga com instruções maliciosas | Bloco de dado, agente sem ferramentas de escrita | Um modelo pode ser enganado em *texto*; por isso nada de ação sensível depende dele |
| Dados pessoais saem para a API do Google | Perfil sem contatos, `dados-complementares` nunca entra; chave só no `.env` | O conteúdo da Base que a Candidata escolher pôr em `secrets/base-conhecimento/` é enviado: decisão dela |
| Portais mudam o formulário | Pendência em vez de arriscar; `--dry-run` | Cobertura depende de cada portal |
| Vetorizador local é fraco | Só para teste/offline; com chave usa embeddings do Gemini | Local não entende sinônimos |
| Dependência de API paga/limitada | Tudo opcional; pipeline não usa LLM | Cota do Gemini |

## 6. Mapa de entregáveis

| Entregável | Caminho |
|---|---|
| Spec do RAG e do Agente | `docs/specs/agente-e-rag.md` |
| RAG próprio | `pipeline/rag/` + `docs/base-conhecimento-exemplo/` |
| Agente funcional | `pipeline/agente/` |
| Aba Assistente IA | `dashboard/server.js`, `dashboard/public/` |
| Porte Google ADK | `agente-adk/` |
| Fluxo n8n | `n8n/README.md` (JSON exportado: a salvar) |
| Este documento | `docs/escopo-projeto-final.md` |
| CI/CD | `.github/workflows/ci.yml` |
