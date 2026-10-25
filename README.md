# Placar

PWA de placares de futebol ao vivo: minimalista, rápido e pensado primeiro para o celular.
*(Nome provisório: veja "Avisos legais" antes de publicar.)*

- **Jogos do dia** agrupados por liga, com seletor de dia (ou arrastar para os lados), **filtros** (ao vivo, favoritos),
  **busca** por time ou campeonato e atualização só enquanto há jogo na tela.
- **Busca de times** em qualquer tela (Ctrl/Cmd+K ou `/`): acha qualquer time de futebol pelo nome e leva à página dele.
- **31 competições**: Brasil, América do Sul, Europa, Américas e seleções (lista abaixo).
- **Página do jogo** com contagem regressiva, resumo, como cada time chega (forma e confrontos), escalações e
  estatísticas, e uma página **Onde assistir** com os jogos do dia e onde cada campeonato costuma passar.
- **Classificação** e **página do time**.
- **Favoritos** no aparelho (times e ligas vão primeiro) e **avisos** de início, gols e fim de jogo.
- **PWA** instalável, com modo offline para o que já foi visto. Tema claro/escuro automático.
- **Sem API paga.** Três fontes gratuitas, com fallback automático e cache próprio.

> **Estado do projeto:** todas as etapas do plano estão implementadas, testadas e **publicadas na Vercel**
> (https://placar-orpin-five.vercel.app). Três coisas **nunca foram exercitadas de verdade** e precisam do seu
> teste antes de confiar: (1) o conector football-data.org com um token real; (2) o conector de e-sports
> (PandaScore) com um token real; (3) os avisos push entregues a um aparelho.
> Veja ["O que não foi verificado"](#o-que-não-foi-verificado).

## Sumário

[Rodar localmente](#rodar-localmente) · [Variáveis de ambiente](#variáveis-de-ambiente) ·
[Arquitetura](#arquitetura) · [API](#api-api) · [Interface](#interface) · [PWA](#pwa) ·
[Notificações push](#notificações-push) · [Como adicionar uma fonte](#como-adicionar-uma-fonte) ·
[Deploy na Vercel](#deploy-na-vercel) · [Avisos legais](#avisos-legais) · [Testes](#testes) ·
[Como contribuir](#como-contribuir) · [O que não foi verificado](#o-que-não-foi-verificado)

## Rodar localmente

Requisitos: Node.js 22.18+ (testado no 24).

```bash
npm install
npm run dev
```

Abra http://localhost:3000. Funciona **sem nenhuma variável de ambiente**: sem token, a fonte
football-data.org é simplesmente pulada. Em `npm run dev` o service worker não é registrado (de propósito);
para ver o PWA e o modo offline use `npm run build && npm start`.

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` · `npm start` | build e servidor de produção |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript sem emitir arquivos |
| `npm test` | testes unitários e de integração simulada (Vitest) |
| `npm run check-sources` | testa o conjunto fixo de fontes candidatas da ETAPA 0 e imprime o quadro-resumo (serve de modelo para avaliar outras) |
| `npm run push:keys` | gera as chaves VAPID e o `CRON_SECRET` dos avisos (não grava nada) |

## Variáveis de ambiente

Copie `.env.example` para `.env.local`. **Nenhuma é obrigatória** para o app abrir.

| Variável | Para quê | Sem ela |
|---|---|---|
| `FOOTBALL_DATA_TOKEN` | fonte reserva football-data.org (cadastro grátis em football-data.org; **só você pode criar**) | a fonte é pulada |
| `PANDASCORE_TOKEN` | e-sports (CS2, LoL, Valorant: calendário e resultados). Cadastro grátis em pandascore.co; **só você pode criar** | a seção E-sports fica desligada e o link some do menu |
| `PANDASCORE_BASE_URL` | só desenvolvimento/testes: aponta para um servidor falso do PandaScore | usa a API real |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | avisos push (gere com `npm run push:keys`) | os avisos ficam desligados e o botão nem aparece |
| `CRON_SECRET` | protege `GET /api/cron/push` (o job de avisos) | em produção a rota responde 404 |
| `STATUS_TOKEN` | protege `GET /api/status` (saúde das fontes, cota, erros) | em produção a rota responde 404 |
| `GITHUB_TOKEN` | só para `npm run check-sources` (evita o limite de 60 req/h do GitHub) | o script roda com menos folga |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | **reservadas, ainda não usadas** (Supabase é fase futura) | sem efeito |

Segredos (`VAPID_PRIVATE_KEY`, `CRON_SECRET`, `STATUS_TOKEN`, `FOOTBALL_DATA_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`)
nunca vão em variável `NEXT_PUBLIC_*` nem para o repositório.

## Arquitetura

O front-end **nunca** chama as fontes externas: só a nossa API (`/api/...`). Por trás dela, conectores
plugáveis implementam a interface `DataSource` (`src/lib/data/data-source.ts`) e devolvem o modelo próprio de
`src/lib/domain/types.ts`. Um orquestrador escolhe a fonte de cada liga, faz fallback, guarda em cache e
respeita a cota de cada fonte.

```
src/
  app/          páginas (/, /jogo, /liga, /time, /favoritos, /sobre, /offline), rotas /api, manifest e ícones
  components/   interface (linhas de jogo, abas, tabela, aviso de dados, interruptor de avisos…)
  lib/
    domain/     modelo normalizado, catálogo de ligas, ids, datas, chave de time, aliases de nomes
    data/       interface DataSource, orquestrador, cache TTL, cota, disjuntor, conectores (sources/)
    api/        validação de parâmetros e respostas das rotas /api
    esports/    CS2, LoL e Valorant (PandaScore): modelo próprio, conversor, cliente, cache e lógica de tela
    push/       avisos: detecção de eventos, job, envio Web Push, repositório
    ui/         lógica de tela sem JSX: formatação, atualização periódica, favoritos, cliente de push
    config.ts   TTLs, cotas de requisição, ordem de prioridade das fontes
public/sw.js    service worker (escrito à mão)
docs/           NOTIFICACOES.md
tests/          testes das rotas /api, do service worker e dos avisos
scripts/        check-sources.ts, generate-vapid-keys.ts
```

### Fontes (resultado da ETAPA 0)

1. **ESPN** (API pública **não oficial**): principal — ao vivo, eventos, escalações, estatísticas, escudos.
2. **openfootball**: base — calendário e resultados em lote (com atraso), sem ao vivo.
3. **football-data.org**: reserva — só Série A e ligas europeias no plano grátis, placar com atraso.

| Fonte | Ao vivo | Eventos / escalações / estatísticas | Escudos | Observação |
|---|---|---|---|---|
| ESPN | sim¹ | sim | sim | API não oficial, sem contrato |
| openfootball | não | não | não | atualizado em lote (dias/semanas de atraso); tabela **calculada** |
| football-data.org | não (placar atrasado) | não (planos pagos) | sim | exige `FOOTBALL_DATA_TOKEN`; **nunca testado com token real** |

¹ Confirmado em 22/10/2026 com jogos reais em andamento (vimos `STATUS_SECOND_HALF`, `STATUS_IN_PROGRESS` e `STATUS_HALFTIME`; o conector reconhece "ao vivo" pelo estado `in` e
pelo período, não só pelo nome do status).

Cada conector fica em `src/lib/data/sources/<fonte>/` (`client.ts` busca, `convert.ts` converte,
`<fonte>-source.ts` implementa `DataSource`) e tem fixtures em `__fixtures__/`.

### Como as fontes são usadas

O orquestrador (`src/lib/data/orchestrator.ts`) é a única porta de entrada das fontes:

- **Fonte por liga e fallback**: para cada liga, a primeira fonte que a cobre e responde (ESPN → football-data →
  openfootball). Se uma cai, a próxima assume só o que faltou. Sobrou liga sem fonte → `meta.missing`.
- **Uma chamada por fonte e dia**: a ESPN tem um feed global com todas as ligas; pedir 1 liga ou 14 custa uma
  chamada, e o ao vivo é derivado das listas de hoje e de ontem (não tem chamadas próprias).
- **Cache por TTL** (`cache.ts`): ao vivo 20 s, hoje 30 s, dias passados 6 h, classificação 10 min. Uma busca
  por chave de cada vez (100 requisições simultâneas viram 1 chamada), dado velho servido se a fonte falhar
  (`stale`, janela curta para o ao vivo) e cache negativo de 60 s para "não existe".
- **Cota por fonte** (`rate-limiter.ts`): janela deslizante abaixo do limite real (ESPN 60/min, football-data
  8/min de 10). Cota esgotada → usa dado velho ou a próxima fonte; nunca chama a fonte.
- **Disjuntor** (`health.ts`): 3 falhas seguidas e a fonte é pulada por 30 s, sem esperar timeouts.
- **Tudo isso vale por instância** do servidor. Em várias instâncias (Vercel) a cota efetiva é multiplicada e
  cada uma tem o seu cache; o ponto de troca para Redis/Edge Config são essas três classes.

## API (`/api`)

O front-end só fala com estas rotas. Todas devolvem JSON; as de dados vêm como `{ data, meta }`.

| Rota | O que devolve |
|---|---|
| `GET /api/leagues` | catálogo de ligas e as fontes que cobrem cada uma |
| `GET /api/matches?date=AAAA-MM-DD&leagues=a,b` | jogos do dia (padrão: hoje em Brasília; ligas: todas) |
| `GET /api/live?leagues=a,b` | jogos em andamento (inclui intervalo) |
| `GET /api/matches/{id}` | detalhe: eventos, escalações, estatísticas, local, árbitro (o que a fonte tiver) |
| `GET /api/standings/{liga}` | classificação, com as zonas (G4, rebaixamento…) |
| `GET /api/teams/{id}?league={liga}` | próximos jogos, últimos resultados e posição |
| `GET /api/teams/search?q=flamengo` | times cujo nome combina com `q` (de 2 a 60 caracteres), com o campeonato quando é do catálogo; cache de 6 h |
| `GET /api/status` | saúde das fontes, cota restante, erros recentes (exige `STATUS_TOKEN` em produção) |
| `GET /api/esports/matches?date=AAAA-MM-DD&games=cs2,lol,valorant` | partidas de e-sports do dia (calendário e resultados, sem ao vivo); 503 `esports_not_configured` sem `PANDASCORE_TOKEN` |
| `GET /api/push/config` | se os avisos estão ligados e a chave VAPID **pública** |
| `POST /api/push/subscribe` · `POST /api/push/unsubscribe` | registra/cancela o aparelho para os avisos |
| `GET /api/cron/push` | o job de avisos, chamado por um agendador (exige `CRON_SECRET` em produção) |

Ids têm o formato `fonte:parte:parte` (ex.: `espn:bra.1:401841272`) e são usados como estão.
Datas aceitas: de 60 dias atrás a 120 à frente (fora disso, 400), para um cliente não gastar a cota das fontes.

**`meta`** diz de onde veio cada dado: `source`/`sources` (quem respondeu), `cache` (`hit`, `miss`, `stale`),
`ttlSeconds` (por quanto tempo é fresco), `fallback` (veio de uma fonte reserva), `missing` (ligas sem dados
em nenhuma fonte) e `failures` (o que falhou no caminho). Cada `Match` também traz a sua `source`.

**Cache-Control** sai do TTL do conteúdo (`s-maxage` de 20 s com jogo ao vivo, 30 s hoje, 6 h para dias
passados), para o CDN da Vercel absorver o tráfego. **Erros**: `400` parâmetro inválido, `404` não existe,
`503` + `Retry-After` quando nenhuma fonte responde (com `failures` no corpo). Competição **sem tabela** (copas,
amistosos) responde `404 unsupported` em `/api/standings/{liga}`: não é falha, é a resposta.

## Interface

| Página | O que mostra |
|---|---|
| `/` | jogos do dia agrupados por liga (favoritos primeiro), seletor de dia, `?d=AAAA-MM-DD` |
| `/jogo/{id}` | placar, contagem regressiva, resumo (linha do tempo), "como cada um chega" (forma e confrontos), escalações, estatísticas e o texto "Sobre a partida" — o que a fonte tiver |
| `/onde-assistir` | jogos do dia por campeonato, com onde cada campeonato costuma passar; busca, filtro por campeonato, `?d=AAAA-MM-DD` |
| `/liga/{id}` | classificação com zonas; ligas com grupos (Libertadores) ganham abas |
| `/time/{id}` | próximos jogos, últimos resultados e posição |
| `/esports` | partidas de CS2, LoL e Valorant do dia (só aparece no menu com `PANDASCORE_TOKEN`), com filtro de torneios principais |
| `/favoritos` | times e ligas favoritos, e o interruptor dos avisos |
| `/sobre`, `/offline` | de onde vêm os dados, limites, privacidade; tela mostrada sem conexão |

**Como cada um chega.** Antes do jogo (e abaixo dos lances depois dele), a página mostra a forma dos dois times (últimos
5 jogos, com V, E e D, contra quem, em casa ou fora, e o placar do ponto de vista do time) e os **últimos confrontos
diretos**, com o saldo calculado dos jogos exibidos. Vem do resumo do jogo da ESPN que o app já busca (campos
`lastFiveGames` e `seasonseries`): **nenhuma chamada a mais**. Só a ESPN informa isso; nas outras fontes a seção some,
em vez de mostrar uma lista vazia. **Sobre a partida** é um parágrafo gerado dos dados (data e hora de Brasília,
local, competição, fase, árbitro, placar), também usado na descrição da página; os títulos de página dizem "onde
assistir, horário e escalações" antes do jogo e "resultado, gols e estatísticas" depois.

**Onde passa.** A página do jogo mostra "Costuma passar em …" **antes e durante** o jogo. É um catálogo por
competição, mantido à mão em `src/lib/domain/broadcasts.ts` (com data da conferência e fontes), porque nenhuma
fonte gratuita informa a transmissão de cada jogo no Brasil (a ESPN devolve o campo vazio) e o Google não tem API
para isso. O app **nunca** afirma o canal de um jogo específico: os direitos são divididos e mudam de jogo para
jogo, e a tela diz para confirmar. Competição sem informação confiável (hoje, Bundesliga e Champions League)
fica sem a linha, de propósito. **Revise o catálogo quando os direitos mudarem** (temporada nova, renovação).

Ids de liga são os do catálogo (`src/lib/domain/leagues.ts`): `brasileirao-a`, `libertadores`, `premier-league`…

Interações da tela inicial (e da de e-sports):

- **Filtros** "Todos", "Ao vivo" e "Favoritos", com contagem. Só aparecem quando há o que filtrar (e ficam, se já
  escolhidos, para dar para desligar). "Favoritos" = jogo em que um dos dois **times** é favorito (liga favorita só
  muda a ordem).
- **Busca** pela lupa: acha por nome, nome curto ou sigla de qualquer time, nome/país do campeonato e fase, sem ligar
  para acento ou caixa; várias palavras valem em qualquer ordem ("fla liberta"). Esc fecha e limpa. Olha os jogos do
  dia escolhido.
- **Busca de times** (botão no cabeçalho e no trilho lateral, ou **Ctrl/Cmd+K** e **`/`** fora de um campo de texto):
  abre um diálogo que procura em todos os times de futebol da ESPN pela `/api/teams/search`, além dos campeonatos do
  catálogo. Enter abre o primeiro resultado. Diferente da lupa da lista, não depende dos jogos do dia.
- **Arrastar para os lados** (celular) troca de dia, sem sair da janela de datas que a API aceita. Ignora gestos que
  começam no campo de busca ou na faixa de dias, e rolagem vertical não conta.
- **Compartilhar** na página do jogo: folha do sistema no celular; no computador copia o link (com plano B para
  navegadores que recusam a área de transferência) e avisa.

Como ela se mantém rápida e honesta:

- **Primeira pintura com dados**: as páginas buscam no servidor (direto no orquestrador) e entregam o HTML
  pronto. Depois, só o cliente atualiza, **sempre pela nossa `/api`**.
- **Atualização inteligente** (`src/lib/ui/use-api.ts`, `refresh.ts`): só atualiza o que está na tela; o
  intervalo vem do TTL da resposta (≈20 s com jogo ao vivo, minutos sem), pausa com a aba escondida ou sem
  internet, volta com recuo (15 s → 30 s → 60 s) se a fonte falhar e mantém os dados antigos na tela.
- **Estados**: esqueleto (`loading.tsx`), erro com "tentar de novo", vazio com explicação do motivo (por
  exemplo, "esta fonte não traz escalações") e aviso quando o dado veio de fonte reserva ou está atrasado.
- **Tema** claro/escuro automático (`prefers-color-scheme`), **movimento reduzido** respeitado, foco visível,
  rótulos falados nos placares, abas com setas do teclado.
- **Favoritos** ficam no aparelho (`localStorage`). Um cookie `placar_fav` espelha só as chaves dos times e
  ids das ligas, para o servidor ordenar a lista certa já na primeira pintura (sem "pulo"). Não é
  identificador nem dado pessoal. A sincronização por conta fica para quando houver Supabase.

## PWA

- `src/app/manifest.ts` (instalável, `standalone`, atalhos), ícones gerados em código (`src/lib/ui/icon.tsx`,
  `app/icon.tsx`, `apple-icon.tsx`, `pwa-icon/[name]`): nenhum arquivo de imagem para manter.
- `public/sw.js`, escrito à mão e registrado só em produção:
  arquivos imutáveis (`/_next/static`, ícones) → cache primeiro; `/api` → rede primeiro (limite de 6 s),
  último dado bom se cair, até 60 respostas; páginas → rede primeiro, cópia da mesma página ou `/offline`.
  Nunca toca em outras origens, em `POST`, em `/api/status` nem em `/api/cron`. Também recebe os avisos push.
  Para invalidar tudo, troque `VERSION` no arquivo.

**Como verificar o service worker:** `npm run build && npm start`, abra no Chrome → DevTools → Application →
Service Workers (deve estar "activated"), marque *Offline* e recarregue uma página já visitada. A lógica do
`sw.js` é testada em `tests/service-worker.test.ts` (Cache e `fetch` simulados). No site publicado (HTTPS) ele
foi visto de verdade em um navegador: registrado, ativo, controlando a página, e os três caches (`placar-pages`,
`placar-api`, `placar-static`) se preenchem como esperado. O que **ainda não foi visto** é o fallback offline em si
(página guardada ou `/offline` com a rede cortada): marque *Offline* no DevTools e confira. Em `http://localhost` o
registro falhou no navegador embutido do ambiente de desenvolvimento; use HTTPS (ou o Chrome em localhost).

## Competições

31 competições no catálogo (`src/lib/domain/leagues.ts`):

| Região | Competições |
|---|---|
| Brasil | Brasileirão A e B, Copa do Brasil, Copa do Nordeste, Paulista, Carioca, Mineiro, Gaúcho |
| América do Sul | Libertadores, Sul-Americana, Recopa, Liga Profesional Argentina |
| Europa | Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Liga Portugal, Eredivisie, Champions, Europa League, Conference League, Liga das Nações |
| Copas nacionais | FA Cup, Copa da Liga Inglesa, Copa del Rey, Coppa Italia, Copa da Alemanha |
| Outras | MLS, Liga MX, Amistosos de seleções |

As 17 mais novas (Recopa em diante) vêm **só da ESPN**: sem o openfootball nem o football-data como reserva, então se a
ESPN cair não há fallback para elas. Os códigos e os ids foram conferidos contra a API real em 22/10/2026, e jogos e
tabelas delas foram vistos funcionando no app. As **zonas** da tabela ficam vazias nessas competições, de propósito:
as vagas mudam por temporada e a ESPN informa as que souber (Champions, mata-mata, acesso…). Competição sem tabela
mostra uma explicação em vez de erro.

Ficaram de fora, por não terem jogo agora: Copa do Mundo, Eurocopa, Copa América, Mundial de Clubes e as Eliminatórias
(a ESPN tem todas). O Brasileirão Feminino não existe na ESPN com o código que tentei (HTTP 400).

**Como adicionar uma competição da ESPN:** descubra o código (`https://site.api.espn.com/apis/site/v2/sports/soccer/<codigo>/scoreboard`
responde 200) e o id numérico da liga (o `l:NNN` do `uid` do evento, em `leagues[0].uid`); acrescente o id em `LEAGUE_IDS`
(`src/lib/domain/types.ts`) e a entrada em `LEAGUES` (`leagues.ts`, com `order` único). Os testes do catálogo conferem
unicidade de códigos, ids e ordem. Teste com jogos e tabela reais antes de publicar. Se tiver tabela, confira também como
as zonas aparecem.

## E-sports

CS2, League of Legends e Valorant, **só calendário e resultados**, em `/esports`. Vivem num módulo próprio
(`src/lib/esports/`), separado do futebol: não há mandante, tabela de pontos nem minuto de jogo, e sim partidas
entre dois times, em série (melhor de N mapas), dentro de torneios que mudam o ano todo.

- **Fonte:** PandaScore, plano gratuito: calendário, resultados e contexto, **1000 requisições por hora e sem
  ao vivo** (o ao vivo é pago). Uma chamada traz os três jogos do dia (até 3 páginas de 100); filtrar por jogo é
  feito no próprio app. O cache é por dia (hoje 60 s, passado 6 h, futuro 30 min) e há um orçamento de 600
  requisições por hora por instância, abaixo do limite da conta.
- **Como ligar:** crie uma conta grátis em pandascore.co, pegue o token e cadastre `PANDASCORE_TOKEN` (no `.env.local`
  e, na Vercel, nas variáveis do projeto, ou `npx vercel env add PANDASCORE_TOKEN production`). Sem o token a seção fica
  desligada e o link "E-sports" some do menu. **O token só você pode criar e nunca deve ir ao repositório.**
- **Tela:** abas por jogo (troca instantânea, sem nova busca), filtro "só torneios principais" (tiers S, A e B do
  PandaScore; ligado sozinho quando há alguma principal no dia), partidas agrupadas por campeonato e etapa,
  placar = mapas vencidos, e links "Assistir" (Twitch, YouTube…) **antes e durante** a partida. Os links vêm do
  PandaScore, só `https` passa.
- **Como a tela é honesta:** diz que o plano gratuito não garante placar ao vivo; partida adiada ou cancelada não
  mostra o 0 x 0 que a fonte manda; adversário indefinido aparece como "A definir".
- **Verificar com o seu token:** ponha `PANDASCORE_TOKEN=...` no `.env.local` e rode `npm run test:esports-live`
  (lê o token do arquivo, faz 1 a 3 requisições; sem token, o teste é pulado). **Isso nunca foi feito**: as respostas de exemplo em `src/lib/esports/__fixtures__/` foram
  escritas pela documentação (veja o `LEIA-ME.md` ali). Se o formato real diferir, o teste aponta e o conversor se ajusta.

## Notificações push

Avisos de início, gols e fim de jogo dos times favoritos (Web Push, sem serviço pago). A estrutura está
pronta e testada por simulação, mas **precisa de 3 coisas suas para funcionar de verdade**: chaves VAPID
(`npm run push:keys`), um armazenamento que persista (hoje é em memória; esquema Supabase pronto) e um
agendador que chame `/api/cron/push` (o cron do plano Hobby da Vercel é diário, não serve). Sem as chaves o
botão de avisos nem aparece. **Nenhum aviso real foi entregue a um aparelho ainda.** Passo a passo, regras,
privacidade e roteiro de teste: [`docs/NOTIFICACOES.md`](docs/NOTIFICACOES.md).

## Como adicionar uma fonte

O app foi feito para trocar ou somar fontes sem mexer na interface. Exemplo: uma fonte chamada `minhafonte`.

1. **Declare o id.** Em `src/lib/domain/types.ts`, acrescente `"minhafonte"` a `SOURCE_IDS`. A partir daqui o
   TypeScript aponta o que falta: rode `npm run typecheck` e siga os erros (são `Record<SourceId, …>`:
   `SOURCE_NAMES` em `src/lib/ui/format.ts`, o mapa de fábricas em `src/lib/data/registry.ts`, `RATE_LIMITS`).
2. **Diga quais ligas ela cobre.** Em `src/lib/domain/leagues.ts`, acrescente o campo no tipo `LeagueSources`
   e o código da competição nessa fonte em cada liga que ela cobre (ausente = não cobre).
3. **Crie o conector** em `src/lib/data/sources/minhafonte/`, seguindo os três existentes:
   - `client.ts`: só busca. Use `requestJson`/`requestText` de `src/lib/data/http.ts`, que já traduzem
     HTTP em `DataSourceError` (429 → `rate_limited`, 404 → `not_found`, 5xx → `unavailable`, tempo
     esgotado → `timeout`). Receba o `fetch` por parâmetro (é assim que os testes não usam a rede).
   - `convert.ts`: **funções puras** do formato da fonte para o modelo de `domain/types.ts`. Ids com
     `makeId("minhafonte", …)`; chave do time com `normalizeTeamKey`; datas de calendário no fuso do app
     (`isOnDate`, `toZonedIsoDate`), não em UTC; horário que a fonte dá em fuso local passa por `zonedTimeToUtc`.
   - `minhafonte-source.ts`: implementa `DataSource`. Declare `capabilities` **sem exagero** (o orquestrador e a
     tela dependem disso: ao vivo, eventos, escalações, estatísticas, tabela, escudos). Lance
     `DataSourceError("unsupported")` para o que ela não cobre. **Não faça cache nem controle de cota aqui**:
     é do orquestrador.
   - `index.ts` exporta a classe.
4. **Registre.** Em `src/lib/data/registry.ts`, acrescente a fábrica; em `src/lib/config.ts`, ponha o id em
   `SOURCE_PRIORITY` na posição certa (a primeira que cobre a liga e responde vence) e o limite real da fonte
   em `RATE_LIMITS` (use um valor **abaixo** do limite dela).
5. **Alinhe os nomes dos times.** Fontes chamam o mesmo time de jeitos diferentes. Se os nomes não casarem
   com os da ESPN, acrescente aliases em `src/lib/domain/team-aliases.ts`; sem isso os favoritos e os
   avisos de uma fonte não valem para a outra.
6. **Teste.** Guarde **respostas reais** em `__fixtures__/` e escreva `convert.test.ts` (conversores) e
   `minhafonte-source.test.ts` (com `fetch` falso, incluindo os erros). Para conferir contra a rede de
   verdade, crie um `*.live.test.ts` desligado por padrão (veja os existentes e a seção "Testes").
7. **Texto na tela.** Cite a fonte em `src/components/app-footer.tsx` e em `src/app/sobre/page.tsx`, e inclua
   os termos de uso dela em "Avisos legais" abaixo.

Antes de adotar uma fonte nova, avalie cobertura, limites e ao vivo com ela de verdade (`scripts/check-sources.ts`
é um bom modelo: acrescente a candidata ali) e leia os termos de uso: gratuito não quer dizer livre para qualquer uso.

## Deploy na Vercel

O app é Next.js padrão e não precisa de configuração especial. **Já está publicado**: projeto `placar` na Vercel
(plano Hobby), ligado ao repositório privado `auralink-dev/placar`, em https://placar-orpin-five.vercel.app.
Cada `git push` na branch `main` publica sozinho. Os passos abaixo servem para refazer em outra conta.

1. Crie um repositório (`git init`, commit) e envie para o GitHub, GitLab ou Bitbucket.
   Confira que `.env.local` **não** foi junto (já está no `.gitignore`).
2. Na Vercel: *Add New → Project*, importe o repositório. O framework Next.js é detectado; o `engines` do
   `package.json` fixa Node 22.18 ou mais novo.
3. Em *Settings → Environment Variables*, cadastre o que for usar (tabela acima). Nenhuma é obrigatória, mas
   para um app público faça pelo menos: `STATUS_TOKEN` (para poder olhar a saúde das fontes) e, se quiser
   o reserva, `FOOTBALL_DATA_TOKEN`. Depois de mudar variáveis, faça um novo deploy.
4. *Deploy*. HTTPS e o domínio `*.vercel.app` vêm de graça. **PWA e avisos exigem HTTPS** (local em `localhost` também vale).
5. Verifique, trocando `SEU-DOMINIO`:
   ```bash
   curl -s https://SEU-DOMINIO/api/leagues | head -c 300
   curl -s "https://SEU-DOMINIO/api/matches" | head -c 300
   curl -s -H "Authorization: Bearer $STATUS_TOKEN" https://SEU-DOMINIO/api/status
   ```
   Abra o site no celular, instale ("Adicionar à tela inicial") e confira DevTools → Application → Service Workers.

O que muda em produção e merece atenção:

- **Cache e cota por instância.** Cada função serverless tem o seu cache, a sua cota e o seu disjuntor. O
  `Cache-Control: s-maxage` das rotas `/api` faz o CDN da Vercel absorver quase todo o tráfego repetido, o
  que reduz o problema, mas a cota de 60 req/min da ESPN passa a valer por instância.
- **A ESPN a partir da Vercel funcionou** na primeira checagem (22/10/2026): jogos do dia, ao vivo, classificação
  da Série A e da Libertadores vieram com `meta.source = "espn"`, sem fallback e sem falhas. É uma API não
  oficial e pode tratar IPs de datacenter de outro jeito amanhã: depois de cada deploy, confira que
  `meta.source` é `espn` e, com `STATUS_TOKEN` configurado, olhe `/api/status` (disjuntor, erros recentes).
- **Região das funções.** Se a maioria do público está no Brasil, avalie escolher uma região próxima
  (São Paulo, `gru1`) nas configurações do projeto: confira na Vercel o que o seu plano permite.
- **Avisos push** pedem armazenamento persistente (Supabase) e um agendador. O cron do plano Hobby roda
  só uma vez por dia. Leia [`docs/NOTIFICACOES.md`](docs/NOTIFICACOES.md) antes de ligar.
- **Limites do plano gratuito** da Vercel (execuções, banda) e as regras de uso mudam: confira antes de divulgar.

## Avisos legais

Este projeto é técnico, **não é aconselhamento jurídico**. Antes de publicar para o público, confira:

- **Escudos, nomes de clubes e de competições** são marcas de seus titulares. O Placar não hospeda escudos:
  carrega as imagens do CDN da ESPN só para identificar times, e mostra o nome do clube ao lado. Não há
  vínculo com clubes, ligas, federações ou provedores de dados (isso está dito na página `/sobre`). Para uso
  comercial ou em escala, pode ser necessário licenciar escudos e dados.
- **ESPN.** A API usada é **pública porém não documentada e sem contrato**: pode mudar ou sair do ar sem aviso, e
  os termos da ESPN podem não autorizar esse uso (principalmente comercial). Para um serviço público ou que
  gere receita, o caminho seguro é um provedor de dados licenciado. O Placar nunca chama a ESPN a partir do
  navegador do usuário: só o servidor, com cache e cota.
- **football-data.org.** Exige cadastro e token **seu**; o plano gratuito tem limite de 10 req/min e restrições
  de uso e de atribuição. Leia os termos vigentes e cumpra o que pedem (a atribuição já aparece no rodapé).
- **PandaScore (e-sports).** Exige conta e token **seus**. Pelo que encontrei, os planos de estatísticas do
  PandaScore não podem ser usados em produtos de apostas ou fantasy; o Placar não tem nenhum dos dois, mas não
  confirmei se a restrição vale também para o plano gratuito. Leia os termos vigentes e cumpra o que pedem
  (a atribuição "e-sports por PandaScore" já aparece no rodapé quando a seção está ativa). Não consegui ler a página
  de termos durante o desenvolvimento: confirme você mesmo se o seu uso (público, com ou sem receita) é permitido.
  Logos de times e campeonatos são marcas de seus titulares, como no futebol.
- **openfootball.** Dados abertos em domínio público (confira a licença no repositório de cada arquivo usado).
- **Nome "Placar": trocar antes de divulgar.** Em 22/10/2026 conferi que `placar.com.br` é o site da **revista
  Placar** (acervo desde 1970), que tem uma página de futebol ao vivo com o título "PLACAR | Brasileirão Série A |
  Futebol Ao Vivo", quase igual ao nosso. `placar.com` é do mesmo dono (redireciona para lá, registrado desde 1997) e
  `placar.app`, `placar.ai` e `placar.online` também estão ocupados. Livres na hora da consulta: `placar.net`,
  `placar.live`, `placar.fun`, `placarapp.com`, `meuplacar.com`, mas qualquer nome com "placar" cai na mesma confusão de
  marca num produto do mesmo ramo. Pesquise a marca no INPI e escolha outro nome. O logotipo e os ícones deste projeto
  são próprios (dois anéis sobre cobalto); não copie os de outros apps ou sites.
- **Privacidade (LGPD).** Sem avisos ligados, não há dado pessoal no servidor. Com avisos ligados, o servidor
  guarda o endereço de entrega do aparelho e as chaves dos times favoritos: se o app for público, publique uma
  política de privacidade, dê meio de apagar (o botão de desligar já apaga) e defina por quanto tempo guarda.
  A página `/sobre` já descreve isso em linguagem simples; revise o texto à luz do seu caso.
- **Precisão.** Placares podem atrasar ou errar (fonte não oficial, cache, fonte reserva). O app diz isso na
  tela e na página `/sobre`. Não use para decisões que dependam do resultado exato, como apostas.
- **Sem apostas.** O app não exibe odds nem incentiva apostas. Se um dia isso mudar, há regras próprias de publicidade e jogo.

## Testes

`npm test` roda tudo (conversores com fixtures, orquestrador, rotas da API, lógica de interface, componentes
com Testing Library, service worker, avisos). Os testes de rede real ficam desligados por padrão:

```bash
ESPN_LIVE=1 npx vitest run src/lib/data/sources/espn/espn-source.live.test.ts
OPENFOOTBALL_LIVE=1 npx vitest run src/lib/data/sources/openfootball/openfootball-source.live.test.ts
FOOTBALL_DATA_TOKEN=seu_token npx vitest run src/lib/data/sources/football-data/football-data-source.live.test.ts
```

O do openfootball compara os times com os da ESPN: quem não casar precisa de um alias em
`src/lib/domain/team-aliases.ts`. O do football-data (**nunca executado com token real**) faz o mesmo e lista os aliases que faltam.

## Como contribuir

Commits no padrão Conventional Commits (`feat:`, `fix:`, `docs:`…), uma branch por assunto, PRs pequenas com o
modelo de `.github/pull_request_template.md` e lint, typecheck e testes passando antes de cada commit. Ferramentas de
IA não entram como coautoras de commits nem de PRs. Detalhes em [`CONTRIBUTING.md`](CONTRIBUTING.md).

## O que não foi verificado

Dito com franqueza, para você não descobrir em produção:

| Item | Situação |
|---|---|
| football-data.org com token real | Fixtures escritas pela **documentação**, nunca validadas contra a API. É a fonte reserva: se o formato real diferir, o fallback falha (e cai para o openfootball). Rode o teste real com o seu token. |
| E-sports (PandaScore) com token real | Conector, conversor e tela testados com respostas **escritas pela documentação** e com um servidor falso local; **nunca falou com a API real**. Também não sabemos o que o plano gratuito devolve de verdade em `running` (ao vivo) nem se `streams_list` vem preenchido nele. Rode o teste real com o seu token. |
| Service worker num navegador real | Registro, ativação, controle da página e preenchimento dos caches foram vistos no site publicado (HTTPS). O **fallback offline** (rede cortada) só foi testado por simulação (`tests/service-worker.test.ts`). |
| Avisos push de ponta a ponta | Nenhum aviso foi entregue a um aparelho. O job rodou contra a ESPN real, mas só com um inscrito fictício, sem envio. |
| Android, iPhone e Safari | Nenhum teste em aparelho. No iPhone, push só funciona com o app instalado na tela de início. |
| Deploy na Vercel | Feito em 22/10/2026 e verificado: site público, rotas `/api` com dados da ESPN, `/api/status` e `/api/cron/push` em 404 sem segredos, avisos desligados sem chaves. Variáveis de ambiente ainda **não foram cadastradas** na Vercel. |
| Armazenamento dos avisos | Em memória. Perde tudo quando a função reinicia. Supabase é fase futura. |
| Desempenho e acessibilidade | Sem Lighthouse nem leitor de tela. Foco, rótulos, contraste e movimento reduzido foram conferidos à mão e por testes de componente. |
| Zonas da classificação | Vêm do catálogo (`leagues.ts`) quando a fonte não informa, e **mudam de ano para ano**: confira o regulamento da temporada. |
| openfootball | Atualizado em lote (a Série A 2026 parou em 20/09; Libertadores só em TXT e defasada). A tabela dele é calculada e ignora confronto direto e punições. |
| Competições novas (17) | Verificadas uma vez contra a ESPN real (22/10/2026): jogos de várias datas e tabelas de 10 delas via API; visualmente só MLS e FA Cup. **Sem reserva** (só ESPN). Zonas da tabela vazias, salvo as que a ESPN informa. |
| Forma e confrontos | Montados dos campos `lastFiveGames` e `seasonseries` do resumo da ESPN, conferidos com um jogo real (Flamengo x Estudiantes). **Não sei se todas as competições da ESPN trazem esses campos** (copas e ligas pequenas podem não trazer; nesse caso a seção some). A ESPN também manda um "saldo" pronto (em inglês) que **não bate** com os jogos listados; usamos o calculado dos jogos exibidos. |
| "Onde assistir" por jogo | Não temos: só por competição (catálogo manual). O campo de transmissão do resumo da ESPN é da **região EUA** (ex.: "beIn Sports"), então não serve para o Brasil. |
| Gestos no celular real | O arrastar para trocar de dia foi testado com eventos de toque no navegador embutido e em testes, **não com um dedo num aparelho de verdade**. O botão Compartilhar não pôde ser testado na folha do sistema (só a cópia do link). |
| Detalhes de jogos ao vivo | Observados em jogos reais em 22/10/2026 (placar, minuto, intervalo); pênaltis, prorrogação e adiados foram verificados com dados simulados e fixtures. |

## Sobre as mensagens do Next.js

O `next dev` gera e mantém o arquivo `AGENTS.md` na raiz com um aviso sobre as mudanças desta versão do
Next.js. Ele é do Next, não do projeto: deixe-o no repositório para não aparecer como alteração solta.
