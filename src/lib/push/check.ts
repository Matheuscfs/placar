import { addDays, todayIso } from "@/lib/domain/dates";
import type { Match } from "@/lib/domain/types";
import type { Orchestrator } from "@/lib/data/orchestrator";
import { detectEvents, snapshotOf } from "./detect";
import { buildNotification } from "./messages";
import type { MatchSnapshot, NotificationPayload, PushSender, PushSubscriber } from "./types";
import type { PushStore } from "./store";

export interface PushCheckDeps {
  orchestrator: Pick<Orchestrator, "getMatchesByDate">;
  store: PushStore;
  sender: PushSender;
  now?: Date;
}

export interface PushCheckReport {
  /** Por que nada foi feito, quando for o caso. */
  skipped?: "no_subscribers" | "no_favorites";
  subscribers: number;
  /** Jogos de times favoritos de alguém que olhamos agora. */
  watchedMatches: number;
  /** Jogos vistos pela primeira vez: só viram referência, não avisam. */
  baselined: number;
  events: number;
  sent: number;
  /** Aparelhos que cancelaram (404/410) e foram removidos. */
  removed: number;
  failed: number;
}

const SNAPSHOT_TTL_MS = 3 * 24 * 3600 * 1000;
const CONCURRENCY = 10;

async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/**
 * O job: olha os jogos dos times que alguém favoritou, compara com a checagem anterior e avisa início,
 * gols e fim. É chamado por um agendador externo (ver `docs/NOTIFICACOES.md`) a cada 1–5 minutos.
 *
 * Custo nas fontes: ZERO chamadas extras, porque usa as mesmas listas do dia (hoje e ontem) que o
 * orquestrador já guarda em cache e controla por cota. Sem inscritos, nem consulta as fontes.
 *
 * Garantia de entrega: NO MÁXIMO UMA VEZ. O estado novo é salvo depois de tentar enviar; se o envio
 * falhar, o aviso não é repetido na checagem seguinte (repetir arriscaria gol duplicado).
 */
export async function runPushCheck({ orchestrator, store, sender, now = new Date() }: PushCheckDeps): Promise<PushCheckReport> {
  const report: PushCheckReport = { subscribers: 0, watchedMatches: 0, baselined: 0, events: 0, sent: 0, removed: 0, failed: 0 };

  const subscribers = await store.listSubscribers();
  report.subscribers = subscribers.length;
  if (subscribers.length === 0) return { ...report, skipped: "no_subscribers" };

  const watched = new Set(subscribers.flatMap((s) => s.teams));
  if (watched.size === 0) return { ...report, skipped: "no_favorites" };

  const today = todayIso(now);
  const [todayList, yesterdayList] = await Promise.allSettled([orchestrator.getMatchesByDate(today), orchestrator.getMatchesByDate(addDays(today, -1))]);
  // Sem a lista de hoje não há com o que comparar: erro (o agendador tenta de novo), e os snapshots ficam como estão.
  if (todayList.status === "rejected") throw todayList.reason;

  const byId = new Map<string, Match>();
  const candidates = [...todayList.value.data, ...(yesterdayList.status === "fulfilled" ? yesterdayList.value.data : [])];
  for (const m of candidates) {
    if ((watched.has(m.home.team.key) || watched.has(m.away.team.key)) && !byId.has(m.id)) byId.set(m.id, m);
  }
  report.watchedMatches = byId.size;

  const previous = await store.getSnapshots([...byId.keys()]);
  const next = new Map<string, MatchSnapshot>();
  const deliveries: Array<{ subscriber: PushSubscriber; payload: NotificationPayload }> = [];

  for (const match of byId.values()) {
    const prev = previous.get(match.id);
    if (!prev) report.baselined++;
    for (const event of detectEvents(prev, match)) {
      report.events++;
      const payload = buildNotification(event, match, prev);
      for (const subscriber of subscribers) {
        if (event.teamKeys.some((k) => subscriber.teams.includes(k))) deliveries.push({ subscriber, payload });
      }
    }
    next.set(match.id, snapshotOf(match, now));
  }

  const gone = new Set<string>();
  await inBatches(deliveries, CONCURRENCY, async ({ subscriber, payload }) => {
    const result = await sender.send(subscriber.subscription, payload);
    if (result === "sent") report.sent++;
    else if (result === "gone") gone.add(subscriber.id);
    else report.failed++;
  });
  for (const id of gone) await store.removeSubscriber(id);
  report.removed = gone.size;

  await store.saveSnapshots(next);
  await store.pruneSnapshots(new Date(now.getTime() - SNAPSHOT_TTL_MS).toISOString());
  return report;
}
