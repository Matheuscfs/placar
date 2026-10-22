"use client";

import { useId, useMemo, useState } from "react";
import { broadcastFor } from "@/lib/domain/broadcasts";
import { addDays } from "@/lib/domain/dates";
import type { IsoDate, LeagueId, Match, Sourced } from "@/lib/domain/types";
import { dateBounds } from "@/lib/ui/days";
import { filterMatches } from "@/lib/ui/filters";
import { formatDayMonth, formatWeekdayLong } from "@/lib/ui/format";
import { groupMatches, hasLive, leagueById } from "@/lib/ui/leagues";
import { nextRefreshMs } from "@/lib/ui/refresh";
import { useApi } from "@/lib/ui/use-api";
import { useFavorites } from "@/lib/ui/use-favorites";
import { useSwipe } from "@/lib/ui/use-swipe";
import { DataNotices, UpdatedAt } from "./data-notices";
import { DayStrip } from "./day-strip";
import { CloseIcon, SearchIcon } from "./icons";
import { MatchRow } from "./match-row";
import { MatchListSkeleton } from "./skeletons";
import { StateMessage } from "./state-message";

/** Jogo que ainda dá para assistir (ou está passando): o que interessa a quem pergunta "onde assistir". */
const watchable = (m: Match) => m.status !== "finished";

export function WhereToWatchView({ today, initialDate, initial }: { today: IsoDate; initialDate: IsoDate; initial: Sourced<Match[]> | null }) {
  const [date, setDate] = useState(initialDate);
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState<LeagueId | "">("");
  const [showFinished, setShowFinished] = useState(false);
  const { favorites, isTeam } = useFavorites();
  const ids = { search: useId(), league: useId(), finished: useId() };

  const api = useApi<Match[]>(`/api/matches?date=${date}`, {
    initial,
    initialUrl: `/api/matches?date=${initialDate}`,
    nextRefreshMs: (data, failures) => nextRefreshMs(data?.meta ?? null, { live: data ? hasLive(data.data) : false, today: date === today, failures }),
  });

  const matches = useMemo(() => api.data?.data ?? [], [api.data]);
  const pool = useMemo(() => (showFinished ? matches : matches.filter(watchable)), [matches, showFinished]);
  // Os campeonatos do select são só os que têm jogo (visível) naquele dia.
  const leaguesToday = useMemo(() => {
    const present = new Set(pool.map((m) => m.leagueId));
    return [...present].flatMap((id) => leagueById(id) ?? []).sort((a, b) => a.order - b.order);
  }, [pool]);
  // Campeonato escolhido que sumiu (outro dia, outro filtro): o filtro não pode ficar preso num valor que não existe mais.
  const activeLeague = league && leaguesToday.some((l) => l.id === league) ? league : "";
  const filtered = useMemo(() => filterMatches(pool, { status: "todos", query, favorites }).filter((m) => !activeLeague || m.leagueId === activeLeague), [pool, query, favorites, activeLeague]);
  const groups = useMemo(() => groupMatches(filtered, favorites), [filtered, favorites]);
  const hiddenFinished = matches.length - matches.filter(watchable).length;

  const select = (next: IsoDate) => {
    setDate(next);
    window.history.replaceState(null, "", next === today ? "/onde-assistir" : `/onde-assistir?d=${next}`);
  };
  const step = (days: number) => {
    const next = addDays(date, days);
    const { min, max } = dateBounds(today);
    if (next >= min && next <= max) select(next);
  };
  const swipe = useSwipe({ onLeft: () => step(1), onRight: () => step(-1) });
  const filtersOn = query.trim() !== "" || activeLeague !== "";

  return (
    <div className="pt-3" {...swipe}>
      <h1>
        <span className="block text-base font-medium text-muted first-letter:uppercase">Onde assistir · {formatWeekdayLong(date)}</span>
        <span className="block text-[2.1rem] font-bold leading-[1.1]">{formatDayMonth(date)}</span>
      </h1>

      <DayStrip selected={date} today={today} onSelect={select} />

      <p className="mt-4 max-w-[52ch] text-sm text-muted">
        Os canais são os de cada competição: onde ela <strong className="font-semibold text-ink">costuma</strong> passar. Os direitos são divididos e o canal de um jogo específico pode ser outro, então confirme na emissora.
      </p>

      {api.data && matches.length > 0 ? (
        <div className="mt-4 space-y-2" data-no-swipe>
          <div className="relative">
            <label htmlFor={ids.search} className="sr-only">
              Buscar time ou campeonato
            </label>
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" width={18} height={18} />
            <input
              id={ids.search}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar time ou campeonato"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
              className="h-11 w-full rounded-full bg-surface pl-11 pr-12 text-[1rem] text-ink placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Limpar a busca" className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-ink">
                <CloseIcon width={18} height={18} />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor={ids.league} className="sr-only">
              Campeonato
            </label>
            <select
              id={ids.league}
              value={activeLeague}
              onChange={(e) => setLeague(e.target.value as LeagueId | "")}
              className="h-11 min-w-0 flex-1 rounded-full bg-surface px-4 text-[0.98rem] font-medium text-ink"
            >
              <option value="">Todos os campeonatos</option>
              {leaguesToday.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <UpdatedAt fetchedAt={api.fetchedAt} refreshing={api.refreshing} onRefresh={api.refresh} />
          </div>

          {hiddenFinished > 0 || showFinished ? (
            <div className="flex items-center justify-between gap-4 border-t border-line pt-1">
              <span id={`${ids.finished}-label`} className="text-[0.95rem] font-medium">
                Incluir jogos encerrados
                {!showFinished ? <span className="num ml-2 font-normal text-muted">({hiddenFinished} ocultos)</span> : null}
              </span>
              <button type="button" role="switch" aria-checked={showFinished} aria-labelledby={`${ids.finished}-label`} onClick={() => setShowFinished(!showFinished)} className="grid h-11 w-14 shrink-0 place-items-center rounded-full">
                <span className={`relative h-7 w-12 rounded-full transition-colors ${showFinished ? "bg-ink" : "bg-faint"}`}>
                  <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-bg shadow-sm transition-transform motion-reduce:transition-none ${showFinished ? "translate-x-5" : ""}`} />
                </span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <DataNotices meta={api.data?.meta ?? null} extra={api.data && api.error ? "Não foi possível atualizar agora. Tentando de novo." : undefined} />

      {api.loading ? (
        <MatchListSkeleton />
      ) : !api.data ? (
        <StateMessage tone="error" title="Não foi possível carregar os jogos" action={{ label: "Tentar de novo", onClick: api.refresh }}>
          {api.error ?? "Confira sua conexão e tente de novo."}
        </StateMessage>
      ) : matches.length === 0 ? (
        <StateMessage title="Nenhum jogo neste dia">Escolha outro dia na faixa acima ou use o calendário.</StateMessage>
      ) : groups.length === 0 ? (
        filtersOn ? (
          <StateMessage
            title={query.trim() ? `Nada encontrado para “${query.trim()}”` : "Nenhum jogo neste campeonato"}
            action={{
              label: "Limpar os filtros",
              onClick: () => {
                setQuery("");
                setLeague("");
              },
            }}
          >
            Confira a grafia ou tire o filtro de campeonato.
          </StateMessage>
        ) : (
          <StateMessage title="Todos os jogos deste dia já terminaram" action={{ label: "Mostrar os encerrados", onClick: () => setShowFinished(true) }}>
            Escolha outro dia na faixa acima para ver o que vem por aí.
          </StateMessage>
        )
      ) : (
        <div>
          {groups.map((g, i) => {
            const info = broadcastFor(g.league.id);
            return (
              <section key={g.league.id} aria-labelledby={`liga-${g.league.id}`} className="mt-9 first:mt-5">
                <h2 id={`liga-${g.league.id}`} className="text-[1.05rem] font-bold">
                  {g.league.name}
                </h2>
                {info ? (
                  <p className="mt-1 text-[0.95rem]">
                    <span className="text-muted">Costuma passar em </span>
                    <span className="font-medium">{info.channels.join(", ")}</span>
                  </p>
                ) : (
                  <p className="mt-1 text-[0.95rem] text-muted">Sem informação de transmissão para esta competição. Confira nas emissoras.</p>
                )}
                {info?.note ? <p className="mt-1 max-w-[52ch] text-sm text-muted">{info.note}</p> : null}
                <div className="mt-1">
                  {g.matches.map((m, j) => (
                    <MatchRow key={m.id} match={m} isFavorite={isTeam} priority={i === 0 && j < 6} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
