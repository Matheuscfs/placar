# Fixtures do football-data.org

**Estas fixtures foram escritas à mão a partir da documentação oficial da API v4**
(docs.football-data.org: páginas *match*, *overtime* e *lookup_tables*). **Não são respostas reais.**
Os endpoints por competição exigem token e nenhum foi usado ainda.

Times, ids e nomes são plausíveis, mas inventados. Os testes só provam que os conversores leem o formato
descrito na documentação. Para confirmar contra a API de verdade:

    FOOTBALL_DATA_TOKEN=seu_token npx vitest run src/lib/data/sources/football-data/football-data-source.live.test.ts

Com um token, substitua estas fixtures por respostas reais podadas (como as da ESPN).
