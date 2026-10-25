# Como contribuir

Regras de commits, branches e pull requests do Placar. Valem para pessoas e para ferramentas de IA.

## Autoria

- O autor de cada commit e de cada PR é **a pessoa** que fez a mudança.
- **Não** acrescente ferramentas de IA como coautoras: nada de `Co-Authored-By: Claude …` (ou de outra IA) no commit
  e nada de "Generated with Claude Code" no texto da PR. O `.claude/settings.json` do projeto já desliga isso no
  Claude Code.

## Branches

- `main` é o que está publicado (cada push na `main` vai para a Vercel). Não trabalhe direto nela.
- Uma branch por assunto, com o mesmo prefixo do tipo do commit:
  `feat/busca-de-times`, `fix/lista-centralizada`, `docs/readme`, `chore/atualiza-next`.
- Antes de abrir a PR, traga a `main` mais recente (`git pull --rebase origin main`) e resolva os conflitos na sua branch.

## Commits

Seguimos o [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/):

```
tipo(escopo opcional): resumo curto no presente

Corpo opcional: o porquê da mudança, o que muda para quem usa
e o que ficou de fora. Quebre as linhas perto de 72 colunas.

Closes #12
```

| Tipo | Quando usar |
|---|---|
| `feat` | algo novo para quem usa o app (tela, rota da API, competição nova) |
| `fix` | conserto de um comportamento errado |
| `refactor` | muda o código sem mudar o comportamento |
| `perf` | deixa mais rápido ou mais leve |
| `test` | só testes |
| `docs` | só documentação (README, `docs/`, comentários) |
| `style` | só formatação, sem mudar a lógica |
| `chore` | dependências, scripts, configuração |
| `ci` | automação de build e deploy |

- **Resumo** em português, com até ~72 caracteres, sem ponto final. Diga o efeito, não o arquivo:
  `fix: lista centralizada em telas largas`, não `fix: ajusta page.tsx`.
- **Um assunto por commit.** Se o resumo precisa de "e", provavelmente são dois commits.
- **Mudança que quebra** algo (rota da API, formato do `meta`, variável de ambiente renomeada): `feat!:` e um
  rodapé `BREAKING CHANGE: …` explicando o que fazer.
- Nunca commite segredos (`.env.local`, tokens, chaves VAPID). O `.gitignore` já cobre os `.env*`.

## Antes de cada commit

```bash
npm run lint
npm run typecheck
npm test
```

Os três precisam passar. Se um teste foi pulado ou desligado de propósito, diga na PR.

### Para `fix`

1. Escreva primeiro um teste que **reproduz o erro** e falha.
2. Corrija e veja o teste passar.
3. Na PR, conte a causa e como reproduzir o erro antes da correção.

### Para `feat`

- Testes da lógica nova (conversores com respostas reais em `__fixtures__/`, rotas em `tests/`, componentes com
  Testing Library).
- Rota nova na API, página nova, variável de ambiente nova ou limite novo: **atualize o README** na mesma PR.
- Mudança visual: print de antes e depois (celular e computador) na PR.

## Pull requests

- **Pequena e de um assunto só.** Uma PR grande demais vira várias.
- **Título** no mesmo formato do commit: `feat: busca de times no cabeçalho`.
- **Descrição** pelo modelo (`.github/pull_request_template.md`): o que muda, por quê, como testar, prints e o que
  não foi verificado.
- Ligue a issue com `Closes #N` quando houver.
- Só faça merge com lint, typecheck e testes passando e a prévia da Vercel conferida.
- Merge com **squash**: a `main` fica com um commit por PR, com o título da PR como mensagem.
- Apague a branch depois do merge.
