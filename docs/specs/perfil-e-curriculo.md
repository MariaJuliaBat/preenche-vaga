# Spec: Perfil e Currículo Sob Medida (modo determinístico)

> Status: implementado no Passo 4 · detalha P12 e P18 a P21 de `pipeline-candidatura.md`
> **O pipeline não usa LLM.** Perfil e Currículo Sob Medida saem de regras: custo zero, sem chave de API, resultado repetível.
> Depende de: `radar-de-vagas.md` (o Lote Final é a entrada do gerador).

## 1. Objetivo

1. Ler o **Currículo Base** (Google Doc) e extrair o **Perfil** por regras: títulos de seção, listas, períodos, contatos e hiperlinks.
2. Fazer o Radar usar a stack e a formação do Perfil, no lugar do `RADAR_STACK` provisório.
3. Gerar, para cada vaga do Lote Final, um **Currículo Sob Medida** em PDF compatível com ATS que só **reordena e prioriza** o que já está no Perfil.

## 2. Bounded Context

| Contexto | Responsabilidade | Lê | Escreve | Onde vive |
|---|---|---|---|---|
| **Perfil** | Ler o Doc, parsear por seções e validar | Google Doc | `output/perfil.json` (só para conferência) | `pipeline/perfil/`, `pipeline/google-docs.js` |
| **Gerador de Currículo** | Comparar vaga e Perfil, reordenar, montar o resumo e desenhar o PDF | Perfil, texto da vaga | `output/cvs/*.pdf` | `pipeline/curriculo/` |
| **Radar** | Pedir ao Perfil a stack e a formação | Perfil | — | `pipeline/radar/` |

Fronteiras: só o Perfil fala com o Google Doc; o PDF nunca contém Dados Complementares (CPF, nascimento etc.); o texto da vaga é só um conjunto de palavras para comparar (dado, nunca instrução).

> **Ensinando:** sem LLM, "não inventar" deixa de ser uma checagem e vira uma **propriedade da construção**: todo valor do Perfil é um trecho copiado do Doc, e o gerador só embaralha itens que já existem. Não há onde um fato novo entrar.

## 3. Linguagem Ubíqua (acrescenta)

| Termo | Definição | No código |
|---|---|---|
| **Texto do Currículo Base** | Texto puro do Doc, com a URL de cada hiperlink ao lado do texto. | `lerTextoDoc` |
| **Título de Seção** | Linha curta que, sem acento e pontuação, é igual a um nome conhecido: Formação, Experiência, Projetos, Habilidades, Idiomas (e variações). | `TITULOS_DE_SECAO` |
| **Cabeçalho do Item** | Linha (ou duas) com cargo ou título, organização e período de uma experiência ou projeto. | `cabecalhoDoItem` |
| **Extração Determinística** | E-mail, telefone, LinkedIn e GitHub achados por regex. | `regras.js` |
| **Palavra-chave** | Termo técnico que está **na vaga e no Perfil** (com grafias equivalentes, como "Node" e "Node.js"). | `palavrasChave` |
| **Lacuna** | Termo técnico que a vaga pede e o Perfil **não** tem. Só vira aviso, nunca entra no PDF. | `lacunas` |
| **Interseção** | Quantas Palavras-chave um item do Perfil cita; ordena itens e tópicos. | `pontos` |
| **Resumo Determinístico** | Formação do Perfil + habilidades alinhadas à vaga + item de destaque, em frase montada por modelo fixo. | `montarResumo` |
| **PDF ATS** | PDF de texto selecionável, uma coluna, sem tabela, imagem ou ícone. | `pdf.js` |

Termos a evitar: "currículo" sozinho (use **Currículo Base** ou **Currículo Sob Medida**), "dados do usuário" (use **Perfil** ou **Dados Complementares**).

## 4. Critérios de Aceitação (EARS)

### Perfil

| # | Padrão | Requisito |
|---|---|---|
| **PF1** | Evento | **Quando** a Etapa `curriculo` rodar, ou o Radar precisar do Perfil, o Pipeline **deve** ler o Doc de `GOOGLE_DOC_CV_BASE_URL` com a Service Account e montar o Texto do Currículo Base, incluindo a URL dos hiperlinks. |
| **PF2** | Ubíquo | O Pipeline **deve** extrair e-mail, telefone, LinkedIn e GitHub por Extração Determinística, e o portfólio como a primeira outra URL do texto (P20). |
| **PF3** | Ubíquo | O Pipeline **deve** dividir o texto por Títulos de Seção e ler cada item das seções Formação, Experiência, Projetos, Habilidades e Idiomas por regra; todo valor do Perfil **deve** ser um trecho do próprio Doc (Ancoragem por construção). Títulos de seções que o Pipeline não usa (Certificações, Cursos, Soft skills...) **devem** ser reconhecidos para encerrar a seção anterior. |
| **PF9** | Ubíquo | Listas (habilidades, idiomas, tecnologias) **devem** ser divididas por vírgula, ponto e vírgula, barra vertical e marcadores **só fora de parênteses**; em Formação, cada linha com período é uma formação própria, tópicos com marcador **não** são formações, e um grau entre parênteses (ex.: "(Licenciatura)") **deve** prevalecer sobre o grau genérico ("Graduação"). |
| **PF4** | Ubíquo | O Perfil **deve** ser validado por schema Zod, com campo ausente como `null` e lista ausente como `[]`, nunca preenchido por suposição (P19). |
| **PF5** | Indesejado | **Se** o Doc estiver inacessível, vazio ou sem nenhum Título de Seção, ou ficar sem nome, ou sem nenhum item, **então** o Pipeline **deve** parar a Etapa com erro claro que diz o que ajustar no Doc (P21). |
| **PF6** | Indesejado | **Se** uma seção esperada não existir no Doc, **então** o Pipeline **deve** avisar e seguir, sem inventar o conteúdo. |
| **PF7** | Estado | **Enquanto** o Doc estiver configurado, o Radar **deve** usar as habilidades e o grau de formação do Perfil; **se** o Perfil não puder ser obtido, **então** o Radar **deve** avisar e seguir com `RADAR_STACK` e a formação "não informada". |
| **PF8** | Ubíquo | O Pipeline **não deve** chamar LLM nem exigir `ANTHROPIC_API_KEY` em nenhuma Etapa. |

### Currículo Sob Medida

| # | Padrão | Requisito |
|---|---|---|
| **CV1** | Evento | **Quando** a Etapa `curriculo` rodar, o Pipeline **deve** gerar um PDF ATS em `output/cvs/` para cada vaga que precisa de currículo: as aprovadas pelo Radar na mesma execução; senão, as linhas da aba "Vagas" com "Se candidatar" na coluna I e sem "CV gerado" na coluna K; sem planilha configurada, o último lote salvo em `output/lote.json`. |
| **CV2** | Ubíquo | O PDF (HTML impresso pelo Chrome ou Edge instalado, ou `PDF_BROWSER_PATH`) **deve** ter texto selecionável, uma coluna, fonte do sistema (Inter, Segoe UI ou Helvetica Neue), listas reais, datas sem quebra e as seções Resumo, Experiência, Projetos, Formação, Habilidades e Idiomas, sem tabela, imagem ou ícone. |
| **CV3** | Ubíquo | Identificação, empresas, cargos, períodos, instituições, cursos, tópicos e habilidades do PDF **devem** ser exatamente os do Perfil; o gerador **só deve** reordenar e escolher entre itens do Perfil (P12). |
| **CV4** | Ubíquo | O gerador **deve** extrair as Palavras-chave da vaga que existem no Perfil, considerando grafias equivalentes, e **deve** ordenar experiências, projetos e tópicos pela Interseção (empate mantém a ordem do Perfil) e colocar as habilidades da vaga primeiro. |
| **CV5** | Ubíquo | O gerador **deve** montar o resumo como um parágrafo corrido, sem rótulos como "Habilidades alinhadas à vaga:" ou "Destaque:": formação do Perfil (com sigla e previsão), foco técnico nas habilidades alinhadas à vaga (ou as principais, sem Palavra-chave) e o item técnico de maior Interseção. |
| **CV13** | Ubíquo | Em vaga de desenvolvimento, o gerador **deve** pôr uma headline abaixo do nome (cargo no foco da vaga + até 4 tecnologias do Perfil), agrupar Habilidades por categoria (Linguagens, Back-End & APIs, Banco de Dados, Automação & Ferramentas, Front-End), cortar habilidades que não são de software e resumir em uma linha as experiências sem tecnologia. |
| **CV14** | Ubíquo | O cabeçalho do PDF **deve** ter só e-mail, telefone, cidade/UF, LinkedIn e GitHub; repositórios e matérias **devem** aparecer sob o projeto com rótulo ("Repositório:", "Notícia:") e URL exata, sem espaços; um portfólio fora dos projetos vai para a linha "Portfólio / Imprensa". |
| **CV6** | Indesejado | **Se** a vaga pedir termo técnico que o Perfil não tem, **então** o gerador **deve** registrar a Lacuna como aviso e **não deve** incluí-la no PDF. **Se** nenhuma Palavra-chave bater, **então** o gerador **deve** manter a ordem original e avisar. |
| **CV7** | Indesejado | **Se** a geração falhar para uma vaga, **então** o Pipeline **deve** registrar a falha no resumo, não gerar PDF parcial e seguir com as demais vagas. |
| **CV8** | Ubíquo | O PDF **não deve** conter Dados Complementares (CPF, nascimento, gênero etc.). |
| **CV9** | Estado | **Enquanto** `--dry-run` estiver ligado, o Pipeline **deve** gerar os PDFs normalmente (arquivos locais em `output/`), sem escrever na planilha nem enviar nada. |
| **CV11** | Evento | **Quando** um currículo for gerado e a planilha puder ser escrita (sem `--dry-run`), o Pipeline **deve** escrever "CV gerado - aguardando revisão" na coluna K da linha da vaga, sem caminho de arquivo, para que o `--only-cv` seguinte não repita a vaga. |
| **CV12** | Ubíquo | Para uma vaga que só tem o link na planilha, o Pipeline **deve** recuperar o texto dela do cache do Radar (`output/vagas.json`) ou, para issues do GitHub, da API pública; **se** não achar texto, **então** **deve** gerar o currículo só com o título da vaga e avisar. |
| **CV10** | Ubíquo | O resumo impresso no terminal **deve** mostrar só contagens do Perfil (formações, experiências, projetos, habilidades, idiomas) e Palavras-chave técnicas, **nunca** nome, contatos ou texto do currículo. |

## 5. Cenários BDD

```gherkin
# language: pt
Funcionalidade: Perfil e Currículo Sob Medida
  Como Candidata
  Quero que o Pipeline leia meu Currículo Base e gere um PDF sob medida para cada vaga
  Para me candidatar com um currículo adaptado que nunca inventa nada, sem pagar por LLM

  # Cobre PF2, PF3 e PF4
  Esquema do Cenário: Doc em formatos diferentes
    Dado um Currículo Base fictício no <formato>
    Quando o Pipeline extrair o Perfil
    Então o Perfil deve ter o nome, o e-mail e o telefone do Doc
    E a experiência na empresa "Acme Exemplo" com cargo e período
    E o LinkedIn deve ser nulo se o Doc não tiver LinkedIn

    Exemplos:
      | formato                                                   |
      | A: títulos em maiúsculas, um item por linha               |
      | B: dois-pontos, cabeçalho em duas linhas, marcadores "•"  |

  # Cobre PF3
  Cenário: Todo valor do Perfil vem do Doc
    Dado um Currículo Base fictício
    Quando o Pipeline extrair o Perfil
    Então cada valor do Perfil deve aparecer no texto do Doc

  # Cobre PF5
  Cenário: Doc sem seções para a Etapa
    Dado um Doc com texto corrido e sem Títulos de Seção
    Quando o Pipeline pedir o Perfil
    Então deve haver um erro dizendo para usar títulos como Formação, Experiência e Habilidades

  # Cobre PF6
  Cenário: Seção ausente vira aviso
    Dado um Doc sem a seção Projetos
    Quando o Pipeline extrair o Perfil
    Então o Perfil deve ter zero projetos
    E deve haver o aviso "Não achei a seção Projetos"

  # Cobre PF7
  Cenário: Radar usa a stack do Perfil
    Dado um Perfil com as habilidades "React" e "Python"
    Quando o Radar pontuar uma vaga que cita "React" e "Python"
    Então a vaga deve ganhar os pontos de stack

  # Cobre CV4 e CV3
  Cenário: Itens com mais interseção sobem
    Dado um Perfil com a experiência A (React e Python) e a experiência B (Python e pandas)
    E uma vaga que pede "Python e pandas"
    Quando o Pipeline montar o Currículo Sob Medida
    Então a experiência B deve vir antes da A
    E nenhum tópico deve ser reescrito

  # Cobre CV4
  Cenário: Grafia equivalente
    Dado um Perfil com "Node.js"
    E uma vaga que pede "Node"
    Quando o Pipeline comparar a vaga com o Perfil
    Então "Node.js" deve ser uma Palavra-chave
    E não deve haver Lacuna de "node"

  # Cobre CV5
  Cenário: Resumo determinístico
    Dado um Perfil com formação e habilidades
    E uma vaga que pede "React" e "Node"
    Quando o Pipeline montar o resumo
    Então ele deve citar a formação e as habilidades "React" e "Node.js" do Perfil
    E não deve citar nenhum termo que só esteja na vaga

  # Cobre CV6
  Cenário: A vaga pede o que o Perfil não tem
    Dado uma vaga que pede "Docker" e um Perfil sem Docker
    Quando o Pipeline montar o Currículo Sob Medida
    Então o PDF não deve conter "Docker"
    E deve haver o aviso "A vaga pede docker, que não está no Perfil"

  # Cobre CV2 e CV8
  Cenário: PDF ATS sem Dados Complementares
    Dado um Perfil e Dados Complementares com CPF fictício
    Quando o Pipeline gerar o PDF
    Então o texto do PDF deve ter as seções esperadas, em ordem
    E o CPF não deve aparecer no PDF

  # Cobre CV7
  Cenário: Uma vaga com erro não derruba as outras
    Dado um Lote Final com 3 vagas e a segunda com erro
    Quando a Etapa curriculo rodar
    Então a primeira e a terceira devem ter PDF
    E o resumo deve listar a falha da segunda

  # Cobre PF9
  Cenário: Parênteses e formações
    Dado um Doc com "Idiomas: Inglês (avançado, leitura e escrita); Espanhol (básico)"
    E a formação "Graduação em Computação (Licenciatura) – Universidade Exemplo | Mar/2025 – Atual"
    E uma segunda linha de formação com outro período
    Quando o Pipeline extrair o Perfil
    Então os idiomas devem ser 2
    E o Perfil deve ter 2 formações
    E o grau da primeira deve ser "Licenciatura"

  # Cobre CV1, CV11 e CV12
  Cenário: --only-cv autônomo
    Dado uma planilha com a vaga A ("Se candidatar", sem CV gerado), a vaga B ("CV gerado") e a vaga C ("Candidatura enviada")
    Quando a Candidata rodar --only-cv sem o Radar
    Então só a vaga A deve ganhar PDF
    E a coluna K da vaga A deve virar "CV gerado - aguardando revisão"
    E uma nova execução não deve gerar nenhum PDF

  # Cobre PF8
  Cenário: Sem chave de LLM
    Dado um .env sem ANTHROPIC_API_KEY
    Quando a Candidata rodar a Etapa curriculo
    Então o Pipeline não deve exigir a chave

  # Cobre CV10
  Cenário: O resumo do terminal não expõe dados pessoais
    Dado um Perfil com nome e e-mail
    Quando o Pipeline imprimir o resumo da execução
    Então ele deve mostrar contagens e palavras-chave técnicas
    E não deve conter o nome nem o e-mail
```

## 6. Rastreabilidade

| Critério | Cenário | Código |
|---|---|---|
| PF1 | — | `pipeline/google-docs.js` |
| PF2 | Doc em formatos diferentes | `pipeline/perfil/regras.js`, `parser.js` (`parsearIdentificacao`) |
| PF3 | Doc em formatos diferentes, Todo valor... | `pipeline/perfil/parser.js` |
| PF4 | Doc em formatos diferentes | `pipeline/perfil/schema.js`, `index.js` |
| PF5, PF6 | Doc sem seções..., Seção ausente... | `pipeline/perfil/parser.js`, `index.js` |
| PF7 | Radar usa a stack... | `pipeline/radar/etapa.js` (`carregarPerfil`), `perfil/index.js` (`perfilParaRadar`) |
| PF8 | Sem chave de LLM | `pipeline/config.js` (`EXIGIDAS`) |
| CV1, CV7, CV9 | Uma vaga com erro... | `pipeline/curriculo/etapa.js` |
| CV2, CV8 | PDF ATS... | `pipeline/curriculo/pdf.js` |
| CV3, CV4, CV5, CV6 | Itens com mais interseção..., Grafia equivalente, Resumo..., A vaga pede... | `pipeline/curriculo/conteudo.js` |
| CV10 | O resumo do terminal... | `pipeline/resumo.js` |
| PF9 | Parênteses e formações | `pipeline/perfil/parser.js` (`dividirLista`, `lerLinhaDeFormacao`) |
| CV11, CV12 | --only-cv autônomo | `pipeline/sheets.js` (`lerPendentesDeCurriculo`, `marcarCurriculoGerado`), `pipeline/curriculo/etapa.js`, `descricao.js`, `pipeline/lote-arquivo.js` |

## 7. Fora do escopo (por enquanto)

- Reescrever frases do currículo para o tom da vaga: exigiria LLM. O ganho vem de reordenar e priorizar.
- Preencher e enviar candidaturas (`apply/`) e atualizar a coluna K da planilha com o status do currículo.
- Currículo em outros formatos (.docx) ou com layout visual elaborado: o PDF é ATS, simples de propósito.
- Docs com layouts muito diferentes dos aceitos (Títulos de Seção ausentes, itens em tabelas aninhadas): o Pipeline para e diz o que ajustar.

## 8. Decisões técnicas

1. **Sem LLM (decisão da Candidata):** custo zero, sem chave, resultado repetível e testável. `@anthropic-ai/sdk` foi removido; `zod` fica só para validar o Perfil.
2. **Sem etapa de build e sem navegador para o PDF:** `pdfkit` gera texto selecionável direto em Node.
3. **Resumo por modelo fixo:** só combina fatos do Perfil. Se a Candidata quiser outro tom, ajusta o Doc.
4. **Limite conhecido:** a lista de termos técnicos usada para achar Lacunas é um vocabulário embutido (`TERMOS_TECNICOS`); termo fora dela não vira aviso, mas também nunca entra no PDF.
