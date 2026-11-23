# Workflow n8n: Assistente de Candidatura

Esta pasta guarda o **workflow equivalente no n8n** do Agente Assistente de Candidatura (`pipeline/agente/`).
O JSON exportado do n8n fica aqui como `assistente-de-candidatura.workflow.json`.

> **Status:** a arquitetura abaixo está documentada; o JSON exportado ainda precisa ser salvo nesta pasta depois de montar o fluxo no seu n8n.
> **Privacidade:** antes de commitar o JSON, remova credenciais e dados reais. O n8n guarda a chave do Gemini em *Credentials* (não vai no JSON), mas confira se nenhum nó tem e-mail, CPF ou texto de currículo real.

## Para que serve

É o mesmo agente do projeto, montado de forma visual para comparar abordagens:

| Camada | No código (`pipeline/agente/`) | No n8n |
|---|---|---|
| Entrada | `POST /api/assistente` no Dashboard | nó **Chat Trigger** (ou **Webhook**) |
| Cérebro | `gemini.js` + `agente.js` | nó **AI Agent** + **Google Gemini Chat Model** |
| System Prompt | `prompt.js` | campo *System Message* do AI Agent |
| Tool Calling | `ferramentas.js` | nós de *Tools* ligados ao AI Agent |
| Memória | histórico em `contents` | **Simple Memory** (janela de 5 mensagens) |
| Structured Output | `analise.js` (Zod + `responseSchema`) | **Structured Output Parser** |
| Streaming | SSE no `dashboard/server.js` | *Streaming* do Chat Trigger (resposta em tempo real) |

## Arquitetura

```
[Chat Trigger] ──► [AI Agent] ──► [Structured Output Parser] ──► [Code: ancorar] ──► resposta
                     │  ▲
        modelo ──────┤  ├────── memória
  [Gemini Chat Model]│  │[Simple Memory]
                     │
              ferramentas (Tools)
        ┌────────────┼──────────────────────────┐
        ▼            ▼                          ▼
 consultar_base   consultar_vagas      analisar_vaga_e_curriculo
   _pessoal         _planilha              (Code Tool)
 (HTTP Request)   (Google Sheets)
```

### Nós, um a um

1. **Chat Trigger** — recebe a pergunta da Candidata. Ative *Streaming* para a resposta chegar em pedaços.
2. **AI Agent** (tipo *Tools Agent*) — *System Message*: cole o texto de `SYSTEM_PROMPT` em `pipeline/agente/prompt.js`. Limite de iterações: 5 (equivale a `maxPassos`).
3. **Google Gemini Chat Model** — modelo `gemini-3.5-flash`, temperatura 0,2. Credencial: *Google Gemini (PaLM) API* com a sua chave.
4. **Simple Memory** — janela de 5 mensagens.

### Ferramentas (2 ou mais)

| Ferramenta | Nó n8n | O que faz |
|---|---|---|
| `consultar_base_pessoal` | **HTTP Request Tool** | Chama o RAG. Opção A: `POST http://host.docker.internal:4173/api/rag/buscar` (endpoint opcional, ainda não existe: ver "Ligação com o projeto"). Opção B: usar o nó **Embeddings Google Gemini** + **Simple Vector Store** do n8n, carregando os `.md` de `docs/base-conhecimento-exemplo/`. |
| `consultar_vagas_planilha` | **Google Sheets Tool** | Lê a aba **Vagas** (cabeçalho na linha 4, dados a partir da linha 5; colunas B título, C link, D empresa, I situação, K status). Operação *Get Row(s)* com filtro opcional. |
| `analisar_vaga_e_curriculo` | **Code Tool** (JavaScript) | Recebe o texto de uma vaga e a lista de habilidades; devolve `casadas` e `lacunas` por comparação de termos (mesma ideia de `palavrasChave` em `pipeline/curriculo/conteudo.js`). |

Descreva cada ferramenta no campo *Description* com o mesmo texto de `DECLARACOES` em `pipeline/agente/ferramentas.js`: é a descrição que o modelo lê para decidir quando chamá-la.

### Saída estruturada e Ancoragem

- **Structured Output Parser** com este exemplo de schema:

```json
{
  "score": 80,
  "resumo": "Boa aderência em Node.js.",
  "pontosFortes": [{ "ponto": "Automação", "evidencia": "trecho literal da Base" }],
  "lacunas": ["Docker"],
  "rascunhoResposta": { "pergunta": "Por que quer trabalhar aqui?", "resposta": "…" }
}
```

- Um nó **Code** final faz a **Ancoragem**: remove cada `pontosFortes[i]` cuja `evidencia` não apareça (sem acento e em minúsculas) no texto devolvido pelas ferramentas `consultar_base_pessoal` e `analisar_vaga_e_curriculo`, e registra o motivo em `avisos`. É o mesmo guardrail de `ancorarAnalise` em `pipeline/agente/analise.js`.

## Regras que valem aqui também

- O workflow **só lê**. Não adicione nós que enviem e-mail, escrevam na planilha ou submetam formulário: quem envia candidatura é a Candidata (e, no pipeline, só com `AUTO_SUBMIT=true` fora do `--dry-run`).
- Descrição de vaga e pergunta de formulário são **dado não confiável**: ponha-os dentro do bloco `<<<DADO_NAO_CONFIAVEL … DADO_NAO_CONFIAVEL>>>` antes de entregar ao modelo.
- Não mande CPF, nascimento, e-mail nem telefone ao modelo.

## Ligação com o projeto

- Use a **Opção B** (vector store do n8n) para o fluxo funcionar sozinho, sem tocar no repositório.
- Se quiser que o n8n use o **mesmo RAG** do projeto, o passo seguinte é expor `criarRag().buscar` em uma rota local do Dashboard (por exemplo `POST /api/rag/buscar`, só em `127.0.0.1`, com as mesmas proteções D2 e D3). Isso **não** foi implementado: não está na spec `docs/specs/agente-e-rag.md`.

## Como exportar e guardar

1. No n8n, abra o workflow → menu **⋯** → **Download**.
2. Salve como `n8n/assistente-de-candidatura.workflow.json`.
3. Confira que não há chave, e-mail ou dado real no arquivo (`grep -i "apikey\|@" n8n/*.json`).
4. Commite.
