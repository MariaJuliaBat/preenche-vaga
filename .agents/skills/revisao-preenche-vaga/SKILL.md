---
name: revisao-preenche-vaga
description: Checklist de revisão de PR da extensão Preenche Vaga. Confere que nada Envia a candidatura (R1), que o Mapeamento fica só em content/mapeamento.js e respeita as fronteiras entre contextos, que os nomes seguem a Linguagem Ubíqua da spec e que os testes conferem o valor preenchido com dados fictícios. Use ao revisar o diff de uma PR deste repositório.
---

# Revisão de PR: Preenche Vaga

Esta skill diz **o que olhar** numa PR deste projeto e **como devolver** os achados.
Ela não substitui o CI (lint, typecheck, build, test): parta do princípio de que o CI
já rodou e procure só o que ele **não** pega.

Fontes de verdade, leia antes de revisar:
- `CLAUDE.md`: convenções do projeto.
- `docs/specs/preenchimento-automatico.md`: Bounded Context (seção 2), Linguagem
  Ubíqua (seção 3), critérios R1–R5 (seção 4) e rastreabilidade (seção 6).

## O que olhar

### 1. Nunca Enviar a candidatura (R1)
- Procure no diff: `.submit(`, `.requestSubmit(`, `.click(`, `dispatchEvent` de
  `submit` ou `click`, e foco/acionamento de `button`, `input[type=submit]` ou
  `input[type=image]`.
- Confira se a lista de tipos ignorados em `content/preencher.js` continua
  incluindo `submit`, `reset`, `button` e `image`.
- O teste "Nunca chama .submit() nem .click()" só lê `preencher.js`. Se o diff criar
  **outro** arquivo de script (ex.: em `content/` ou `popup/`), verifique se ele
  também está coberto.

### 2. Mapeamento centralizado e fronteiras entre contextos
- Todo Sinônimo novo fica em `MAPEAMENTO_CAMPOS` (`content/mapeamento.js`). Nenhuma
  palavra-chave de Campo solta em `preencher.js` ou `popup/`.
- *Preenchimento* (`preencher.js`) **lê** o Currículo e **consulta** o Mapeamento;
  nunca altera o Currículo nem cria Sinônimos.
- A ordem das Pistas do Campo continua label → name → id → placeholder
  (`obterTextosDoCampo`).
- Sinônimo novo não pode "roubar" Campos de outro Dado do Currículo. Como a busca
  usa `includes`, uma palavra curta ou genérica (ex.: "site", "link", "nome") pode
  casar com Pistas de outros Campos. Pense em labels reais de Gupy, Vagas.com e Catho.
- Dado do Currículo novo precisa existir nos **três** lugares: `MAPEAMENTO_CAMPOS`,
  o objeto `curriculo` e o Campo correspondente em `paginas-teste/`.

### 3. Testes que conferem o cenário, e dados fictícios
- Todo comportamento novo tem teste em `tests/` que confere o **valor** do Campo
  (`assert.strictEqual(campo.value, ...)`), não só que o código rodou sem erro.
- O teste cita o critério que cobre (R1–R5) no nome, como os testes existentes.
- Se o diff muda comportamento, a spec (`docs/specs/`) foi atualizada: Linguagem
  Ubíqua (lista de Dados do Currículo), cenários BDD e tabela de rastreabilidade.
- Nenhum dado real de pessoa: nomes, e-mails, telefones e links precisam ser
  claramente fictícios (ex.: `exemplo.com`, `99999-0000`).

### 4. Linguagem Ubíqua
- Nomes novos (variáveis, testes, commits, comentários) usam os termos da spec:
  Candidata, Currículo, Dado do Currículo, Campo, Pista, Sinônimo, Mapeamento,
  Reconhecer, Preencher, Enviar.
- Termos a evitar: "usuário" (use Candidata), "input" em texto de negócio (use
  Campo), "autocompletar" (use Preencher).

## Como trabalhar
1. `gh pr view <número>` para entender o objetivo da PR.
2. `gh pr diff <número>` para ver o que mudou.
3. Leia os arquivos tocados **inteiros**, não só o trecho do diff, e use
   `grep -n` para achar a linha exata de cada achado no arquivo novo.
4. Só reporte o que você viu no código. Não invente achados para encher a lista.

## Como classificar
- **BLOQUEIA**: quebra R1 (pode Enviar), quebra a fronteira do Mapeamento, expõe
  dado real ou faz um teste existente deixar de conferir o que conferia.
- **SUGESTÃO**: melhora clareza, cobertura ou robustez, mas a PR pode entrar sem ela.
- **DÚVIDA**: não dá para decidir só pelo diff; precisa de uma conversa ou de um
  teste em site real.

## Formato da saída
Devolva **apenas** o Markdown abaixo, pronto para ser postado como comentário na PR:

```markdown
## 🔎 Revisão do agente `revisor` — PR #<número>

**Resumo:** <1–2 frases sobre a PR e a impressão geral>

### Achados

#### 1. [BLOQUEIA|SUGESTÃO|DÚVIDA] <título curto>
- **Arquivo:** `caminho/do/arquivo.js:<linha>`
- **Problema:** <o que está errado ou faltando, com o trecho de código>
- **Por que importa:** <qual regra (R1–R5, CLAUDE.md, spec) e qual o efeito para a Candidata>
- **Sugestão:** <correção mínima>

(repita para cada achado, do BLOQUEIA para a DÚVIDA)

### O que não consegui verificar
- <ex.: comportamento em sites reais, coisas fora do diff>

_Total: <n> achados (<x> bloqueia, <y> sugestão, <z> dúvida)._
```

Se não houver achados, escreva "Sem achados" e liste o que você examinou.
