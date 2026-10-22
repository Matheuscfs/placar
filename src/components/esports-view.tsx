"use client";

import { useId, useMemo, useState } from "react";
import { addDays } from "@/lib/domain/dates";
import type { IsoDate } from "@/lib/domain/types";
import type { EsportsMatch, EsportsMeta, EsportsResult } from "@/lib/esports/types";
import { GAME_FULL_NAME, GAME_LABEL, groupEsports, hasLiveEsports, isMainTier, type GameTab } from "@/lib/esports/ui";
import { dateBounds } from "@/lib/ui/days";
import { formatDayMonth, formatAge, formatWeekdayLong } from "@/lib/ui/format";
import { nextRefreshMs } from "@/lib/ui/refresh";
import { useApi } from "@/lib/ui/use-api";
import { useNow } from "@/lib/ui/use-now";
import { useSwipe } from "@/lib/ui/use-swipe";
import { UpdatedAt } from "./data-notices";
import { DayStrip } from "./day-strip";
import { EsportsRow } from "./esports-row";
import { MatchListSkeleton } from "./skeletons";
import { StateMessage } from "./state-message";
import { Tabs, panelProps, type TabItem } from "./tabs";

const TABS: TabItem<GameTab>[] = [{ id: "todos", label: "Todos" }, ...(["cs2", "lol", "valorant"] as const).map((id) => ({ id, label: GAME_LABEL[id] }))];

/** Avisos de qualidade do dado: fonte sem resposta (dado velho) e dia com partidas demais. */
function Notices({ meta, error }: { meta: EsportsMeta | null; error: string | null }) {
  const now = useNow(15_000);
  if (!meta) return null;
  const notes: string[] = [];
  if (meta.cache === "stale") notes.push(`A fonte de e-sports não respondeu agora. Mostrando os dados de ${now !== null ? formatAge(now - Date.parse(meta.fetchedAt)) : "antes"}.`);
  if (meta.truncated) notes.push("Este dia tem partidas demais: a lista pode estar incompleta.");
  if (error) notes.push("Não foi possível atualizar agora. Tentando de novo.");
  if (notes.length === 0) return null;
  return (
    <div role="status" className="mt-5 space-y-1 border-l-2 border-line pl-3 text-sm text-muted">
      {notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </div>
  );
}

export function EsportsView({ today, initialDate, initialGame, initial }: { today: IsoDate; initialDate: IsoDate; initialGame: GameTab; initial: EsportsResult | null }) {
  const [date, setDate] = useState(initialDate);
  const [tab, setTab] = useState<GameTab>(initialGame);
  // `null` = automático (principais, se houver); depois que a pessoa mexe no interruptor, vale a escolha dela.
  const [mainChoice, setMainChoice] = useState<boolean | null>(null);
  const switchId = useId();

  const api = useApi<EsportsMatch[], EsportsMeta>(`/api/esports/matches?date=${date}`, {
    initial,
    initialUrl: `/api/esports/matches?date=${initialDate}`,
    nextRefreshMs: (data, failures) => nextRefreshMs(data?.meta ?? null, { live: data ? hasLiveEsports(data.data) : false, today: date === today, failures }),
  });

  const all = useMemo(() => api.data?.data ?? [], [api.data]);
  const ofGame = useMemo(() => (tab === "todos" ? all : all.filter((m) => m.game === tab)), [all, tab]);
  const mainCount = ofGame.filter((m) => isMainTier(m.tier)).length;
  const hasMinor = mainCount < ofGame.length;
  const mainOnly = mainChoice ?? mainCount > 0;
  const groups = useMemo(() => groupEsports(ofGame, { mainOnly: mainOnly && hasMinor }), [ofGame, mainOnly, hasMinor]);
  const shown = groups.reduce((n, g) => n + g.matches.length, 0);
  const hidden = ofGame.length - shown;
  const liveCount = ofGame.filter((m) => m.status === "live").length;

  const sync = (nextDate: IsoDate, nextTab: GameTab) => {
    // A URL acompanha o que está na tela (dá para compartilhar), sem recarregar a página.
    const q = new URLSearchParams();
    if (nextDate !== today) q.set("d", nextDate);
    if (nextTab !== "todos") q.set("g", nextTab);
    window.history.replaceState(null, "", q.size > 0 ? `/esports?${q}` : "/esports");
  };
  const selectDate = (next: IsoDate) => {
    setDate(next);
    sync(next, tab);
  };
  // Arrastar para a esquerda avança um dia; para a direita, volta. Nunca sai da janela que a API aceita.
  const step = (days: number) => {
    const next = addDays(date, days);
    const { min, max } = dateBounds(today);
    if (next >= min && next <= max) selectDate(next);
  };
  const swipe = useSwipe({ onLeft: () => step(1), onRight: () => step(-1) });
  const selectTab = (next: GameTab) => {
    setTab(next);
    sync(date, next);
  };

  return (
    <div className="pt-3" {...swipe}>
      <h1>
        <span className="block text-base font-medium text-muted first-letter:uppercase">E-sports · {formatWeekdayLong(date)}</span>
        <span className="block text-[2.1rem] font-bold leading-[1.1]">{formatDayMonth(date)}</span>
      </h1>

      <DayStrip selected={date} today={today} onSelect={selectDate} />

      <div className="mt-4">
        <Tabs tabs={TABS} value={tab} onChange={selectTab} label="Jogo" idPrefix="esports" />
      </div>

      <div className="mt-3 flex min-h-11 items-center justify-between gap-3 text-[0.95rem]">
        <p className="num" aria-live="polite">
          {api.data ? (
            liveCount > 0 ? (
              <span className="inline-flex items-center gap-2 font-semibold text-live">
                <span aria-hidden className="live-dot" />
                {liveCount} em andamento
              </span>
            ) : (
              <span className="text-muted">{shown === 0 ? "Sem partidas" : shown === 1 ? "1 partida" : `${shown} partidas`}</span>
            )
          ) : null}
        </p>
        <UpdatedAt fetchedAt={api.fetchedAt} refreshing={api.refreshing} onRefresh={api.refresh} />
      </div>

      {api.data && (hasMinor || mainChoice !== null) ? (
        <div className="flex items-center justify-between gap-4 border-t border-line py-2">
          <span id={`${switchId}-label`} className="text-[0.95rem] font-medium">
            Só torneios principais
            {mainOnly && hidden > 0 ? <span className="num ml-2 font-normal text-muted">({hidden} {hidden === 1 ? "oculta" : "ocultas"})</span> : null}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={mainOnly}
            aria-labelledby={`${switchId}-label`}
            onClick={() => setMainChoice(!mainOnly)}
            className="grid h-11 w-14 shrink-0 place-items-center rounded-full"
          >
            <span className={`relative h-7 w-12 rounded-full transition-colors ${mainOnly ? "bg-ink" : "bg-faint"}`}>
              <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-bg shadow-sm transition-transform motion-reduce:transition-none ${mainOnly ? "translate-x-5" : ""}`} />
            </span>
          </button>
        </div>
      ) : null}

      <Notices meta={api.data?.meta ?? null} error={api.data && api.error ? api.error : null} />

      <div {...panelProps("esports", tab)} className="mt-2">
        {api.loading ? (
          <MatchListSkeleton />
        ) : !api.data ? (
          <StateMessage tone="error" title="Não foi possível carregar as partidas" action={{ label: "Tentar de novo", onClick: api.refresh }}>
            {api.error ?? "Confira sua conexão e tente de novo."}
          </StateMessage>
        ) : groups.length === 0 ? (
          <StateMessage
            title={ofGame.length > 0 ? "Só há partidas de torneios menores" : tab === "todos" ? "Nenhuma partida neste dia" : `Nenhuma partida de ${GAME_FULL_NAME[tab]} neste dia`}
            action={ofGame.length > 0 ? { label: "Mostrar todas", onClick: () => setMainChoice(false) } : undefined}
          >
            {ofGame.length > 0 ? "Desligue o filtro para ver tudo." : "Escolha outro dia na faixa acima ou outro jogo."}
          </StateMessage>
        ) : (
          groups.map((g, i) => (
            <section key={g.key} aria-label={g.league} className="mt-8 first:mt-3">
              <h2 className="mb-1 text-[1.05rem] font-bold">
                {g.league}
                {g.serie ? <span className="ml-2 text-[0.95rem] font-normal text-muted">{g.serie}</span> : null}
              </h2>
              {g.matches.map((m, j) => (
                <EsportsRow key={m.id} match={m} priority={i === 0 && j < 6} />
              ))}
            </section>
          ))
        )}
      </div>

      <p className="mt-10 max-w-[46ch] text-sm text-muted">Calendário e resultados. O plano gratuito da fonte (PandaScore) não garante placar ao vivo: o resultado aparece quando a série termina.</p>
    </div>
  );
}
