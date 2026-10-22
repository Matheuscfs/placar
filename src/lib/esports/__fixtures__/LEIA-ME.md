# Fixtures do PandaScore

**Estas respostas foram ESCRITAS à mão a partir da documentação** (`GET /matches`,
developers.pandascore.co/reference/get_matches), **nunca capturadas da API real**: o plano gratuito exige um
token que só o dono do projeto pode criar. Nomes de times, ligas e links são inventados.

Elas cobrem os casos que o conversor precisa tratar: partida encerrada, em andamento, agendada com adversário
indefinido, adiada, cancelada, W.O., jogo que não é um dos três suportados, partida sem horário, links de
transmissão perigosos e formato quebrado.

**Quando tiver o token**, rode `PANDASCORE_TOKEN=... npx vitest run src/lib/esports/pandascore.live.test.ts`
e, se o formato real diferir, substitua estes arquivos por respostas reais e ajuste o conversor.
