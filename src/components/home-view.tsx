"use client";

import { useMemo, useState } from "react";
import type { IsoDate, Match, Sourced } from "@/lib/domain/types";
import { formatDayMonth, formatWeekdayLong } from "@/lib/ui/format";
import { groupMatches, hasLive } from "@/lib/ui/leagues";
import { nextRefreshMs } from "@/lib/ui/refresh";
import { useApi } from "@/lib/ui/use-api";
import { useFavorites } from "@/lib/ui/use-favorites";
import { DataNotices, UpdatedAt } from "./data-notices";
import { DayStrip } from "./day-strip";
import { LeagueSection } from "./league-section";
import { MatchListSkeleton } from "./skeletons";
import { StateMessage } from "./state-message";

export function HomeView({ today, initialDate, initial }: { today: IsoDate; initialDate: IsoDate; initial: Sourced<Match[]> | null }) {
  const [date, setDate] = useState(initialDate);
  const { favorites } = useFavorites();

  const api = useApi<Match[]>(`/api/matches?date=${date}`, {
    initial,
    initialUrl: `/api/matches?date=${initialDate}`,
    nextRefreshMs: (data, failures) => nextRefreshMs(data?.meta ?? null, { live: data ? hasLive(data.data) : false, today: date === today, failures }),
  });

  const matches = useMemo(() => api.data?.data ?? [], [api.data]);
  const groups = useMemo(() => groupMatches(matches, favorites), [matches, favorites]);
  const liveCount = matches.filter((m) => m.status === "live" || m.status === "halftime").length;

  const select = (next: IsoDate) => {
    setDate(next);
    // A URL acompanha o dia escolhido (dá para compartilhar), sem recarregar a página.
    window.history.replaceState(null, "", next === today ? "/" : `/?d=${next}`);
  };

  return (
    <div className="pt-3">
      {/* O dia da semana fica discreto e a data ganha o destaque: dois níveis claros em vez de uma frase que quebra no meio. */}
      <h1>
        <span className="block text-base font-medium text-muted first-letter:uppercase">{formatWeekdayLong(date)}</span>
        <span className="block text-[2.1rem] font-bold leading-[1.1]">{formatDayMonth(date)}</span>
      </h1>

      <DayStrip selected={date} today={today} onSelect={select} />

      <div className="mt-3 flex min-h-11 items-center justify-between gap-3 text-[0.95rem]">
        <p className="num" aria-live="polite">
          {api.data ? (
            liveCount > 0 ? (
              <span className="inline-flex items-center gap-2 font-semibold text-live">
                <span aria-hidden className="live-dot" />
                {liveCount === 1 ? "1 jogo ao vivo" : `${liveCount} jogos ao vivo`}
              </span>
            ) : (
              <span className="text-muted">{matches.length === 0 ? "Sem jogos" : matches.length === 1 ? "1 jogo" : `${matches.length} jogos`}</span>
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
      ) : groups.length === 0 ? (
        <StateMessage title="Nenhum jogo neste dia" action={{ label: "Ver a classificação do Brasileirão", href: "/liga/brasileirao-a" }}>
          Escolha outro dia na faixa acima ou use o calendário.
        </StateMessage>
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
