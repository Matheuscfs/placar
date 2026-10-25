@AGENTS.md

## Regras do projeto

Siga o [CONTRIBUTING.md](CONTRIBUTING.md) em todo commit e toda PR. O essencial:

- **Sem atribuição ao Claude**: nunca adicione `Co-Authored-By: Claude …` em commits nem "Generated with Claude Code"
  em PRs. O autor é a pessoa dona do repositório.
- Commits no formato Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`…), resumo em português, um assunto por commit.
- Trabalhe numa branch (`feat/…`, `fix/…`), nunca direto na `main` (cada push na `main` publica na Vercel).
- Antes de commitar: `npm run lint`, `npm run typecheck` e `npm test` passando.
- `fix` vem com um teste que reproduz o erro; `feat` que muda rotas, páginas ou variáveis de ambiente atualiza o README.
