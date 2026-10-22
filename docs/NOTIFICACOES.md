# Notificações push

Avisos de **início, gols e fim de jogo** dos times favoritos, mesmo com o app fechado, usando Web Push
(padrão aberto, sem serviço pago). Esta página diz o que **já está pronto**, o que **você precisa
fazer** para ligar de verdade e o que **ainda não foi testado**.

> **Estado honesto:** a estrutura inteira está escrita e coberta por testes automatizados, mas **nenhum
> aviso real foi entregue a um aparelho**. Isso exige um navegador com service worker, chaves VAPID e um
> agendador, e nada disso existia no ambiente de desenvolvimento. Trate a primeira ativação em produção
> como um teste (roteiro no fim desta página).

## Como funciona

```
 aparelho                      Placar (servidor)                       serviço de push
 ────────                      ─────────────────                       (Google/Mozilla/Apple)
 toque em "Avisos"
   │ pede permissão
   │ cria inscrição ───────────► POST /api/push/subscribe
   │   (endpoint + chaves)         guarda: endpoint + chaves dos times favoritos
   │
   │                    agendador ► GET /api/cron/push  (a cada 1–5 min, com CRON_SECRET)
   │                                 1. pega os jogos de hoje e de ontem (mesmo cache do app)
   │                                 2. compara com a checagem anterior (início? gol? fim?)
   │                                 3. para cada mudança, envia a quem favoritou um dos times ──► entrega
   │ ◄──────────────────────────────────────────────────────────────────────────────────────────── aviso
 service worker mostra a notificação; o toque abre /jogo/{id}
```

| Peça | Onde |
|---|---|
| Detecção de eventos (início, gol, fim) | `src/lib/push/detect.ts` |
| Texto dos avisos (pt-BR) | `src/lib/push/messages.ts` |
| O job | `src/lib/push/check.ts` → rota `GET /api/cron/push` |
| Envio (`web-push`, VAPID, criptografia) | `src/lib/push/sender.ts` |
| Validação da inscrição (anti-SSRF) | `src/lib/push/subscription.ts` |
| Repositório de inscritos e estado dos jogos | `src/lib/push/store.ts` (**só em memória**, ver abaixo) |
| Rotas | `/api/push/config`, `/api/push/subscribe`, `/api/push/unsubscribe`, `/api/cron/push` |
| Navegador | `src/lib/ui/push-client.ts`, `use-push.ts`, `src/components/push-toggle.tsx` |
| Service worker (`push`, `notificationclick`) | `public/sw.js` |

### Regras de aviso (e por quê)

- **Só times favoritos.** Favoritar uma *liga* só muda a ordem na tela inicial; avisar por liga seria um
  aviso por gol da rodada inteira.
- **Início**, **gol** (um por checagem, com o placar de agora) e **fim de jogo**. Sem intervalo, cartões ou
  escalação: mais avisos que isso é o que faz as pessoas desligarem tudo.
- **Primeira vez que o job vê um jogo, não avisa nada** (só guarda o estado): pode ser um jogo que já estava
  no meio, e um "gol" velho seria mentira. Consequência: quem se inscreve no meio de um jogo só recebe a
  partir da checagem seguinte.
- **Gol anulado (placar diminui) não gera aviso**; o placar novo vira a referência.
- **No máximo uma vez.** O estado novo é salvo depois de tentar enviar; se o envio falhar, o aviso **não** é
  repetido (repetir arriscaria gol duplicado). Falhas aparecem em `failed` no relatório do job.
- O aviso expira em 2 minutos no serviço de push (gol entregue tarde é pior que gol nenhum) e os avisos do mesmo
  jogo se substituem na tela (`tag`), com som/vibração de novo só nos gols (`renotify`).
- Aparelho que cancelou (resposta 404/410 do serviço de push) é removido sozinho.

### Custo nas fontes

O job **não faz chamadas extras às fontes**: usa as listas do dia (hoje e ontem) que o orquestrador já
guarda em cache e protege com cota. Sem nenhum inscrito, nem consulta as fontes.
**Atraso total** de um gol = atraso da fonte (não medido: a ESPN é uma API não oficial e sem garantia) + cache
de 30 s + intervalo do agendador. Não espere "na hora"; meça no primeiro jogo de verdade.

## O que falta fazer (checklist)

### 1. Chaves VAPID  *(obrigatório; 2 minutos)*

```bash
npm run push:keys
```

Copie as linhas para o `.env.local` **e** para as variáveis de ambiente do projeto na Vercel
(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`). Troque o
`VAPID_SUBJECT` por um e-mail (`mailto:`) ou site (`https://`) seu. A chave privada é segredo; trocar o par
depois invalida todas as inscrições (cada aparelho teria de reativar os avisos).
Sem as chaves, **os avisos ficam desligados e o botão nem aparece**: o resto do app não é afetado.

### 2. Armazenamento que sobreviva  *(obrigatório em produção)*

O `MemoryPushStore` perde tudo quando a função reinicia e **não é compartilhado entre instâncias**. Na
Vercel isso significa inscritos que somem. Em produção, implemente a interface `PushStore`
(`src/lib/push/store.ts`) sobre o Supabase e troque o retorno de `getPushStore()`. Esquema sugerido:

```sql
create table push_subscribers (
  id          text primary key,          -- sha256 do endpoint (hex)
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  teams       text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table match_snapshots (
  match_id    text primary key,
  status      text not null,
  home_score  integer,
  away_score  integer,
  seen_at     timestamptz not null
);

-- Só o servidor (chave service_role) acessa. Com RLS ligada e SEM políticas, o acesso público é negado.
alter table push_subscribers enable row level security;
alter table match_snapshots  enable row level security;
```

Use `SUPABASE_SERVICE_ROLE_KEY` **apenas no servidor**, nunca em `NEXT_PUBLIC_*`. `endpoint`, `p256dh` e
`auth` são credenciais de entrega do aparelho: trate como segredo (não registre em logs).
Para evitar avisos duplicados com mais de uma instância rodando o job ao mesmo tempo, faça a gravação dos
snapshots condicional (por exemplo `update ... where status = <anterior> and home_score is not distinct from <anterior>`)
ou use um lock simples (`pg_try_advisory_lock`) no começo do job.

### 3. Agendador  *(obrigatório: algo precisa chamar o job)*

O app não tem processo próprio rodando; alguém tem de chamar `GET /api/cron/push` com
`Authorization: Bearer <CRON_SECRET>`. Opções, da mais simples à mais precisa:

- **Vercel Cron.** O plano **Hobby limita a cron a uma execução por dia** (confira na documentação da
  Vercel, os limites mudam): inútil para gols. Em um plano pago, `vercel.json`:
  ```json
  { "crons": [{ "path": "/api/cron/push", "schedule": "*/2 * * * *" }] }
  ```
  A Vercel envia o `CRON_SECRET` sozinha. **Não coloque esse bloco no Hobby**: o deploy é recusado.
- **GitHub Actions** (grátis; mínimo de 5 min e pode atrasar vários minutos em horário de pico):
  ```yaml
  on: { schedule: [{ cron: "*/5 * * * *" }] }
  jobs:
    push:
      runs-on: ubuntu-latest
      steps:
        - run: curl -fsS -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" https://SEU-DOMINIO/api/cron/push
  ```
- **Serviço externo de cron** (cron-job.org e similares): chamada a cada 1–2 min com o cabeçalho acima.

Dica de economia: o job responde `skipped: "no_subscribers"` sem tocar nas fontes quando ninguém se inscreveu.

### 4. Teste em aparelho real  *(nunca foi feito)*

1. `npm run build && npm start` com o `.env.local` preenchido (em `npm run dev` o service worker **não** é
   registrado, então o botão responde "os avisos precisam do app publicado").
2. No Chrome, abra o site por **localhost ou https**, vá em *Favoritos*, favorite um time que jogue hoje e ligue **Avisos**.
3. DevTools → Application → Service Workers: deve estar "activated"; em *Push* dá para disparar um aviso de teste.
4. Chame o job à mão: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/push` e leia o
   relatório (`subscribers`, `watchedMatches`, `events`, `sent`, `failed`, `removed`). Durante um jogo do time, repita:
   a 1ª chamada só guarda o estado; o aviso vem na primeira mudança (início, gol ou fim).
5. Repita no celular **Android** (Chrome) e, se importar, no **iPhone** (veja abaixo).

### 5. iPhone e iPad

O Safari só permite push a um site **instalado na tela de início** (iOS/iPadOS 16.4+). Fora disso as APIs não
existem, e o app mostra a instrução "Compartilhar → Adicionar à Tela de Início". Exige HTTPS e o manifest
(já existe). Não foi testado em aparelho Apple.

## Privacidade

Não há conta. Para avisar, o servidor guarda **o endereço de entrega do aparelho** (`endpoint` + chaves) e
**as chaves dos times favoritos**. Isso é dado pessoal indireto: se o app for público, cite na política de
privacidade, ofereça a exclusão (o botão de desligar já apaga o cadastro do servidor) e defina por quanto
tempo guarda inscrições inativas (o job já apaga as que o serviço de push informa como inválidas).

## Segurança

- **SSRF:** o servidor chama o `endpoint` enviado pelo navegador; por isso só são aceitos `https` nos
  domínios reais de push (Google FCM, Mozilla, Apple, Windows). Qualquer outro é rejeitado.
- **Job protegido:** em produção, sem `CRON_SECRET` a rota responde 404; com ele, só quem enviar o token
  (comparação em tempo constante).
- **Abuso da rota de inscrição:** corpo limitado a 8 KB, `application/json` obrigatório, no máximo 60 times por
  aparelho e teto de inscritos em memória. Para tráfego público de verdade, adicione limite de taxa no
  firewall da Vercel para `/api/push/*`.
- A **chave privada VAPID** nunca vai ao navegador; `/api/push/config` entrega só a pública.

## Limitações conhecidas

- Sem aviso de gol anulado, cartão vermelho, escalação ou "falta 1 hora": só início, gol e fim.
- Não sabemos **quem** fez o gol (as fontes de lista não trazem autor); o aviso diz o time e o placar.
- Jogo cuja fonte mudou no meio do caminho (fallback) tem outro id e recomeça como "primeira vez": sem aviso
  duplicado, mas pode perder um aviso na troca.
- Cada instância guarda o seu próprio estado enquanto o repositório for o de memória (item 2).
