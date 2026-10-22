"use client";

import { useMemo, useState } from "react";
import { addDays } from "@/lib/domain/dates";
import type { IsoDate, Match, Sourced } from "@/lib/domain/types";
import { dateBounds } from "@/lib/ui/days";
import { filterMatches, isLiveMatch, type StatusFilter } from "@/lib/ui/filters";
import { formatDayMonth, formatWeekdayLong } from "@/lib/ui/format";
import { groupMatches, hasLive, involvesFavorite } from "@/lib/ui/leagues";
import { nextRefreshMs } from "@/lib/ui/refresh";
import { useApi } from "@/lib/ui/use-api";
import { useFavorites } from "@/lib/ui/use-favorites";
import { useSwipe } from "@/lib/ui/use-swipe";
import { DataNotices, UpdatedAt } from "./data-notices";
import { DayStrip } from "./day-strip";
import { LeagueSection } from "./league-section";
import { MatchFilters } from "./match-filters";
import { MatchListSkeleton } from "./skeletons";
import { StateMessage } from "./state-message";

export function HomeView({ today, initialDate, initial }: { today: IsoDate; initialDate: IsoDate; initial: Sourced<Match[]> | null }) {
  const [date, setDate] = useState(initialDate);
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const { favorites } = useFavorites();

  const api = useApi<Match[]>(`/api/matches?date=${date}`, {
    initial,
    initialUrl: `/api/matches?date=${initialDate}`,
    nextRefreshMs: (data, failures) => nextRefreshMs(data?.meta ?? null, { live: data ? hasLive(data.data) : false, today: date === today, failures }),
  });

  const matches = useMemo(() => api.data?.data ?? [], [api.data]);
  const liveTotal = useMemo(() => matches.filter(isLiveMatch).length, [matches]);
  const favoriteTotal = useMemo(() => matches.filter((m) => involvesFavorite(m, favorites)).length, [matches, favorites]);
  const filtered = useMemo(() => filterMatches(matches, { status, query, favorites }), [matches, status, query, favorites]);
  const groups = useMemo(() => groupMatches(filtered, favorites), [filtered, favorites]);
  const liveCount = filtered.filter(isLiveMatch).length;
  const filtering = filtered.length !== matches.length;

  const select = (next: IsoDate) => {
    setDate(next);
    // A URL acompanha o dia escolhido (dá para compartilhar), sem recarregar a página.
    window.history.replaceState(null, "", next === today ? "/" : `/?d=${next}`);
  };
  // Arrastar para a esquerda avança um dia; para a direita, volta. Nunca sai da janela que a API aceita.
  const step = (days: number) => {
    const next = addDays(date, days);
    const { min, max } = dateBounds(today);
    if (next >= min && next <= max) select(next);
  };
  const swipe = useSwipe({ onLeft: () => step(1), onRight: () => step(-1) });

  return (
    <div className="pt-3" {...swipe}>
      {/* O dia da semana fica discreto e a data ganha o destaque: dois níveis claros em vez de uma frase que quebra no meio. */}
      <h1>
        <span className="block text-base font-medium text-muted first-letter:uppercase">{formatWeekdayLong(date)}</span>
        <span className="block text-[2.1rem] font-bold leading-[1.1]">{formatDayMonth(date)}</span>
      </h1>

      <DayStrip selected={date} today={today} onSelect={select} />

      {api.data ? (
        <MatchFilters
          status={status}
          onStatus={setStatus}
          liveCount={liveTotal}
          favoriteCount={favoriteTotal}
          query={query}
          onQuery={setQuery}
          searchOpen={searchOpen}
          onSearchOpen={setSearchOpen}
        />
      ) : null}

      <div className="mt-2 flex min-h-11 items-center justify-between gap-3 text-[0.95rem]">
        <p className="num" aria-live="polite">
          {api.data ? (
            liveCount > 0 ? (
              <span className="inline-flex items-center gap-2 font-semibold text-live">
                <span aria-hidden className="live-dot" />
                {liveCount === 1 ? "1 jogo ao vivo" : `${liveCount} jogos ao vivo`}
              </span>
            ) : (
              <span className="text-muted">
                {filtered.length === 0 ? "Sem jogos" : filtered.length === 1 ? "1 jogo" : `${filtered.length} jogos`}
                {filtering && matches.length > 0 ? ` de ${matches.length}` : ""}
              </span>
            )
          ) : null}
        </p>
        <UpdatedAt fetchedAt={api.fetchedAt} refreshing={api.refreshing} onRefresh={api.refresh} />
      </div>
      <DataNotices meta={api.data?.meta ?? null} extra={api.data && api.error ? "Não foi possível atualizar agora. Tentando de novo." : undefined} />

      {api.loading ? (
        <MatchListSkeleton />
      ) : !api.data ? (
        <StateMessage tone="error" title="Não foi possível carregar os jogos" action={{ label: "Tentar de novo", onClick: api.refresh }}>
          {api.error ?? "Confira sua conexão e tente de novo."}
        </StateMessage>
      ) : matches.length === 0 ? (
        <StateMessage title="Nenhum jogo neste dia" action={{ label: "Ver a classificação do Brasileirão", href: "/liga/brasileirao-a" }}>
          Escolha outro dia na faixa acima ou use o calendário.
        </StateMessage>
      ) : groups.length === 0 ? (
        <EmptyFilter
          query={query.trim()}
          status={status}
          onClearQuery={() => setQuery("")}
          onShowAll={() => {
            setStatus("todos");
            setQuery("");
          }}
        />
      ) : (
        <div>
          {groups.map((g, i) => (
            <LeagueSection key={g.league.id} group={g} priority={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Os filtros esconderam tudo: diz qual filtro foi e oferece o caminho de volta. */
function EmptyFilter({ query, status, onClearQuery, onShowAll }: { query: string; status: StatusFilter; onClearQuery: () => void; onShowAll: () => void }) {
  if (query) {
    return (
      <StateMessage title={`Nada encontrado para “${query}”`} action={{ label: "Limpar a busca", onClick: onClearQuery }}>
        Confira a grafia ou busque só parte do nome. A busca olha os jogos do dia escolhido.
      </StateMessage>
    );
  }
  return status === "ao-vivo" ? (
    <StateMessage title="Nenhum jogo ao vivo agora" action={{ label: "Ver todos os jogos", onClick: onShowAll }}>
      Quando um jogo começar, ele aparece aqui.
    </StateMessage>
  ) : (
    <StateMessage title="Nenhum jogo dos seus favoritos neste dia" action={{ label: "Ver todos os jogos", onClick: onShowAll }}>
      Favorite times e campeonatos tocando na estrela, e os jogos deles aparecem aqui.
    </StateMessage>
  );
}
