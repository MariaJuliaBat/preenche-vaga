# Spec: Perfil e Currículo Sob Medida

> Status: implementado no Passo 4 do Pipeline (falta validar com o Doc real e a chave do LLM) · detalha P12 e P18 a P21 de `pipeline-candidatura.md`
> Depende de: `radar-de-vagas.md` (o Lote Final é a entrada do gerador).

## 1. Objetivo

1. Ler o **Currículo Base** (Google Doc) e extrair o **Perfil**, sem inventar nada (Ancoragem estrita).
2. Fazer o Radar usar a stack e a formação do Perfil, no lugar do `RADAR_STACK` provisório.
3. Gerar, para cada vaga do Lote Final, um **Currículo Sob Medida** em PDF compatível com ATS, que só **reorganiza, prioriza e reescreve** fatos que já estão no Perfil.

## 2. Bounded Context

| Contexto | Responsabilidade | Lê | Escreve | Onde vive |
|---|---|---|---|---|
| **Perfil** | Ler o Doc, extrair, ancorar e validar | Google Doc, LLM | `output/perfil.json` (cache) | `pipeline/perfil/`, `pipeline/google-docs.js` |
| **Gerador de Currículo** | Escolher, ordenar e reescrever fatos do Perfil para uma vaga; desenhar o PDF | Perfil, texto da vaga, LLM | `output/cvs/*.pdf` | `pipeline/curriculo/` |
| **LLM** | Devolver JSON validado; **sem ferramentas** | texto delimitado | nada | `pipeline/llm.js` |
| **Radar** | Pedir ao Perfil a stack e a formação | Perfil | — | `pipeline/radar/` |

Fronteiras: o LLM nunca recebe Dados Complementares (P23); o PDF nunca contém CPF, nascimento ou outros Dados Complementares; só o Perfil fala com o Google Doc.

> **Ensinando:** por que o gerador devolve *índices* e não texto livre? Porque assim empresa, cargo, período e instituição **não passam pela mão do LLM**: o código copia do Perfil. O LLM só escolhe a ordem e reescreve frases, e cada frase reescrita ainda passa pela Ancoragem.

## 3. Linguagem Ubíqua (acrescenta)

| Termo | Definição | No código |
|---|---|---|
| **Texto do Currículo Base** | Texto puro do Doc, com a URL de cada hiperlink ao lado do texto. | `lerTextoDoc` |
| **Extração Determinística** | E-mail, telefone, LinkedIn e GitHub achados por regra, sem LLM. Vence o valor do LLM. | `regras.js` |
| **Ancoragem** | Conferir que um valor extraído aparece no Texto do Currículo Base (comparação Normalizada). Para períodos e números, todo número do valor tem de existir no texto. | `ancorar.js` |
| **Aviso de Ancoragem** | Registro, no terminal, de um valor descartado por não ter âncora. | `avisos` |
| **Cache do Perfil** | `output/perfil.json` com o hash do Texto do Currículo Base; se o hash não mudou, o Perfil é reaproveitado sem chamar o LLM. | `cache.js` |
| **Conteúdo Sob Medida** | Resposta do LLM: resumo, índices das experiências escolhidas com frases reescritas, e habilidades em ordem de relevância. | `ConteudoSchema` |
| **PDF ATS** | PDF de texto selecionável, uma coluna, sem tabela, imagem ou ícone. | `pdf.js` |

Termos a evitar: "currículo" sozinho (use **Currículo Base** ou **Currículo Sob Medida**), "dados do usuário" (use **Perfil** ou **Dados Complementares**).

## 4. Critérios de Aceitação (EARS)

### Perfil

| # | Padrão | Requisito |
|---|---|---|
| **PF1** | Evento | **Quando** a Etapa `curriculo` rodar, ou o Radar precisar do Perfil, o Pipeline **deve** ler o Doc de `GOOGLE_DOC_CV_BASE_URL` com a Service Account e montar o Texto do Currículo Base, incluindo a URL dos hiperlinks. |
| **PF2** | Ubíquo | O Pipeline **deve** extrair e-mail, telefone, LinkedIn e GitHub por Extração Determinística antes de qualquer LLM; o valor determinístico **deve** prevalecer sobre o do LLM (P20). |
| **PF3** | Ubíquo | Todo valor factual do Perfil **deve** passar por Ancoragem; o que não tiver âncora **deve** ser descartado (campo `null` ou item removido) com Aviso de Ancoragem (P19, P20). |
| **PF4** | Ubíquo | O Perfil **deve** ser validado por schema Zod, com campo ausente como `null` e lista ausente como `[]`, nunca preenchido por suposição (P19). |
| **PF5** | Indesejado | **Se** o Doc estiver inacessível ou vazio, ou o Perfil falhar no schema, ou ficar sem nome após a Ancoragem, **então** o Pipeline **deve** parar a Etapa com erro claro (P21). |
| **PF6** | Estado | **Enquanto** o hash do Texto do Currículo Base for igual ao do Cache do Perfil, o Pipeline **deve** reaproveitar o Perfil sem chamar o LLM. |
| **PF7** | Estado | **Enquanto** o Doc e a chave do LLM estiverem configurados, o Radar **deve** usar as habilidades e o grau de formação do Perfil; **se** o Perfil não puder ser obtido, **então** o Radar **deve** avisar e seguir com `RADAR_STACK` e a formação "não informada". |
| **PF8** | Ubíquo | O LLM **deve** receber só o Texto do Currículo Base (P23), delimitado como dado, sem ferramentas, e **deve** devolver JSON validado (P13). |

### Currículo Sob Medida

| # | Padrão | Requisito |
|---|---|---|
| **CV1** | Evento | **Quando** a Etapa `curriculo` rodar, o Pipeline **deve** gerar um PDF ATS em `output/cvs/` para cada vaga do Lote Final (a do Radar da mesma execução ou a salva em `output/lote.json`). |
| **CV2** | Ubíquo | O PDF **deve** ter texto selecionável, uma coluna, fonte padrão e seções "Resumo", "Experiência", "Projetos", "Formação", "Habilidades" e "Idiomas", sem tabela, imagem ou ícone. |
| **CV3** | Ubíquo | Identificação, empresas, cargos, períodos, instituições e cursos do PDF **devem** vir do Perfil, nunca do LLM; o LLM só escolhe e ordena itens por índice, reescreve frases e ordena habilidades (P12). |
| **CV4** | Indesejado | **Se** um texto reescrito (tópico ou resumo) tiver número ausente na fonte, termo técnico ou com maiúscula que não esteja na fonte, palavra-chave que só aparece na vaga, ou pouca sobreposição de palavras com a fonte, **então** o Pipeline **deve** descartá-lo; para tópicos, **deve** usar as frases originais do item; para o resumo, **deve** usar um resumo determinístico só com fatos do Perfil (formação e habilidades), com aviso. |
| **CV5** | Indesejado | **Se** o LLM devolver índice inexistente ou repetido, ou habilidade que não esteja no Perfil, **então** o Pipeline **deve** ignorar o item e registrar aviso. |
| **CV6** | Ubíquo | O texto da vaga **deve** ir ao LLM como dado delimitado e truncado, e **nunca** como instrução (P13). |
| **CV7** | Indesejado | **Se** o LLM recusar ou falhar para uma vaga, **então** o Pipeline **deve** registrar a falha no resumo, não gerar PDF parcial e seguir com as demais vagas. |
| **CV8** | Ubíquo | O PDF **não deve** conter Dados Complementares (CPF, nascimento, gênero etc.). |
| **CV9** | Estado | **Enquanto** `--dry-run` estiver ligado, o Pipeline **deve** gerar os PDFs normalmente (arquivos locais em `output/`), sem escrever na planilha nem enviar nada. |

## 5. Cenários BDD

```gherkin
# language: pt
Funcionalidade: Perfil e Currículo Sob Medida
  Como Candidata
  Quero que o Pipeline leia meu Currículo Base e gere um PDF sob medida para cada vaga
  Para me candidatar com um currículo adaptado que nunca inventa nada

  # Cobre PF2 e PF3
  Cenário: Valores sem âncora são descartados
    Dado um Texto do Currículo Base fictício com o e-mail "maria@exemplo.com" e a empresa "Acme Exemplo"
    E uma resposta do LLM com a empresa "Globex Inventada" e o e-mail "outra@exemplo.com"
    Quando o Pipeline extrair o Perfil
    Então o e-mail deve ser "maria@exemplo.com"
    E a empresa "Globex Inventada" não deve estar no Perfil
    E deve haver um Aviso de Ancoragem

  # Cobre PF4
  Cenário: Ausente fica nulo
    Dado um Currículo Base sem LinkedIn
    Quando o Pipeline extrair o Perfil
    Então o LinkedIn deve ser nulo

  # Cobre PF5
  Cenário: Doc vazio para a Etapa
    Dado um Doc sem texto
    Quando o Pipeline pedir o Perfil
    Então deve haver um erro claro e nenhuma chamada ao LLM

  # Cobre PF6
  Cenário: Cache do Perfil evita nova chamada ao LLM
    Dado um Perfil em cache com o hash do texto atual
    Quando o Pipeline pedir o Perfil de novo
    Então o LLM não deve ser chamado

  # Cobre PF7
  Cenário: Radar usa a stack do Perfil
    Dado um Perfil com a habilidade "React"
    Quando o Radar pontuar uma vaga que cita "React"
    Então a vaga deve ganhar os pontos de stack

  # Cobre CV3 e CV5
  Cenário: O PDF usa fatos do Perfil por índice
    Dado um Perfil com a experiência 0 em "Acme Exemplo"
    E uma resposta do LLM que escolhe os índices 0 e 7
    Quando o Pipeline montar o Currículo Sob Medida
    Então o PDF deve citar "Acme Exemplo" com o cargo e o período do Perfil
    E o índice 7 deve ser ignorado com aviso

  # Cobre CV4
  Cenário: Palavra-chave só da vaga não vaza para o resumo
    Dado uma vaga que cita "Docker" e um Perfil sem Docker
    E um resumo do LLM que diz "experiência com Docker"
    Quando o Pipeline montar o Currículo Sob Medida
    Então o resumo deve ser o resumo determinístico do Perfil
    E deve haver um aviso

  # Cobre CV4
  Cenário: Métrica inventada é descartada
    Dado um item do Perfil sem números
    E uma frase reescrita pelo LLM que diz "reduzi custos em 40%"
    Quando o Pipeline montar o Currículo Sob Medida
    Então a frase deve ser descartada
    E as frases originais do item devem ser usadas

  # Cobre CV2 e CV8
  Cenário: PDF ATS sem Dados Complementares
    Dado um Perfil e Dados Complementares com CPF fictício
    Quando o Pipeline gerar o PDF
    Então o texto do PDF deve ter as seções esperadas
    E o CPF não deve aparecer no PDF

  # Cobre CV7
  Cenário: Falha do LLM não derruba as outras vagas
    Dado um Lote Final com 2 vagas e o LLM falhando na primeira
    Quando a Etapa curriculo rodar
    Então a segunda vaga deve ter PDF
    E o resumo deve listar a falha da primeira
```

## 6. Rastreabilidade

| Critério | Cenário | Código |
|---|---|---|
| PF1 | — | `pipeline/google-docs.js` |
| PF2, PF3 | Valores sem âncora... | `pipeline/perfil/regras.js`, `ancorar.js`, `index.js` |
| PF4, PF5 | Ausente fica nulo, Doc vazio | `pipeline/perfil/schema.js`, `index.js` |
| PF6 | Cache do Perfil... | `pipeline/perfil/cache.js` |
| PF7 | Radar usa a stack do Perfil | `pipeline/radar/etapa.js` |
| PF8, CV6 | — | `pipeline/llm.js`, `pipeline/perfil/index.js`, `pipeline/curriculo/conteudo.js` |
| CV1, CV7, CV9 | Falha do LLM... | `pipeline/curriculo/etapa.js` |
| CV2, CV8 | PDF ATS... | `pipeline/curriculo/pdf.js` |
| CV3, CV4, CV5 | O PDF usa fatos..., Métrica inventada... | `pipeline/curriculo/conteudo.js` |

## 7. Fora do escopo (por enquanto)

- Preencher e enviar candidaturas (`apply/`) e atualizar a coluna K da planilha com o status do currículo.
- Currículo em outros formatos (.docx) ou com layout visual elaborado: o PDF é ATS, simples de propósito.
- Traduzir o currículo para outros idiomas.
- Detectar variações de grafia de tecnologia ("NodeJS" x "Node.js"): na dúvida, a Ancoragem descarta.

## 8. Decisões técnicas

1. **Modelo:** `claude-opus-5-5` por padrão, configurável em `ANTHROPIC_MODEL`. Com o `fallbacks` do servidor ligado (`"default"`), uma recusa por classificador reexecuta a chamada em outro modelo.
2. **Sem etapa de build e sem navegador para o PDF:** `pdfkit` gera texto selecionável direto em Node.
3. **Hash do texto no cache:** a regra de "extrair a cada execução" (P18) fica equivalente, sem pagar o LLM se o Doc não mudou.
4. **Ancoragem conservadora:** na dúvida, descarta. É melhor um PDF mais curto que um fato inventado.
