"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays } from "@/lib/domain/dates";
import type { IsoDate, LeagueId, Match, Sourced } from "@/lib/domain/types";
import { dateBounds } from "@/lib/ui/days";
import { filterMatches, isLiveMatch, type StatusFilter } from "@/lib/ui/filters";
import { formatDayMonth, formatWeekdayLong } from "@/lib/ui/format";
import { publishDayLeagues, showAllLeagues, type DayLeague } from "@/lib/ui/league-filter";
import { groupMatches, hasLive, involvesFavorite } from "@/lib/ui/leagues";
import { nextRefreshMs } from "@/lib/ui/refresh";
import { useApi } from "@/lib/ui/use-api";
import { useFavorites } from "@/lib/ui/use-favorites";
import { useLeagueFilter } from "@/lib/ui/use-league-filter";
import { useMedia } from "@/lib/ui/use-media";
import { useSwipe } from "@/lib/ui/use-swipe";
import { SPLIT_QUERY, XL_QUERY } from "@/lib/ui/viewport";
import { DataNotices, UpdatedAt } from "./data-notices";
import { DayStrip } from "./day-strip";
import { LeagueSection } from "./league-section";
import { LiveStrip } from "./live-strip";
import { MatchFilters } from "./match-filters";
import { MatchView } from "./match-view";
import { PanelView } from "./panel-view";
import { MatchListSkeleton } from "./skeletons";
import { StateMessage } from "./state-message";

/** Sem nenhum campeonato desmarcado. */
const NONE: readonly LeagueId[] = [];

export function HomeView({ today, initialDate, initial }: { today: IsoDate; initialDate: IsoDate; initial: Sourced<Match[]> | null }) {
  const [date, setDate] = useState(initialDate);
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"lista" | "painel">("lista");
  const { favorites } = useFavorites();
  // O detalhe ao lado, o painel e o filtro de campeonatos só existem em telas largas: no celular nem são montados.
  const split = useMedia(SPLIT_QUERY);
  const xl = useMedia(XL_QUERY);

  const api = useApi<Match[]>(`/api/matches?date=${date}`, {
    initial,
    initialUrl: `/api/matches?date=${initialDate}`,
    nextRefreshMs: (data, failures) => nextRefreshMs(data?.meta ?? null, { live: data ? hasLive(data.data) : false, today: date === today, failures }),
  });

  const matches = useMemo(() => api.data?.data ?? [], [api.data]);

  // Campeonatos do dia: o trilho lateral mostra as caixas (só em tela larga) e a pessoa desmarca os que não quer ver.
  const dayLeagues = useMemo<DayLeague[]>(() => groupMatches(matches, favorites).map((g) => ({ id: g.league.id, name: g.league.shortName, total: g.matches.length })), [matches, favorites]);
  useEffect(() => {
    publishDayLeagues(dayLeagues);
  }, [dayLeagues]);
  useEffect(() => () => publishDayLeagues([]), []);
  const off = useLeagueFilter().off;
  const hidden = xl ? off : NONE;
  const scoped = useMemo(() => (hidden.length ? matches.filter((m) => !hidden.includes(m.leagueId)) : matches), [matches, hidden]);

  const liveMatches = useMemo(() => scoped.filter(isLiveMatch), [scoped]);
  const liveTotal = liveMatches.length;
  const favoriteTotal = useMemo(() => scoped.filter((m) => involvesFavorite(m, favorites)).length, [scoped, favorites]);
  const filtered = useMemo(() => filterMatches(scoped, { status, query, favorites }), [scoped, status, query, favorites]);
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

  const panel = view === "painel" && xl;
  // Trocar de dia fecha o detalhe: o jogo aberto pode nem existir no dia novo.
  const pick = (next: IsoDate) => {
    setSelectedId(null);
    select(next);
  };

  return (
    // data-wide: libera a largura da página (ver globals.css). No celular a coluna continua estreita; a partir de 768 px
    // a lista fica à esquerda e o detalhe do jogo escolhido à direita.
    <div data-wide className="min-[768px]:flex">
      <div
        // Telas largas: a lista fica numa coluna de leitura centralizada entre o trilho e o detalhe (não grudada na esquerda); o painel usa a largura toda.
        className={`mx-auto w-full min-w-0 max-w-[40rem] px-5 pt-3 min-[768px]:flex-1 min-[768px]:px-5 min-[1200px]:px-8 ${panel ? "min-[768px]:max-w-none" : "min-[768px]:max-w-[56rem]"}`}
        {...swipe}
      >
        <div className="flex items-end justify-between gap-4">
          {/* O dia da semana fica discreto e a data ganha o destaque: dois níveis claros em vez de uma frase que quebra no meio. */}
          <h1>
            <span className="block text-base font-medium text-muted first-letter:uppercase">{formatWeekdayLong(date)}</span>
            <span className="block text-[2.1rem] font-bold leading-[1.1]">{formatDayMonth(date)}</span>
          </h1>
          {xl ? (
            <div role="group" aria-label="Modo de exibição" className="flex rounded-full bg-surface p-1" data-no-swipe>
              {(["lista", "painel"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`h-8 rounded-full px-4 text-sm font-semibold ${view === v ? "bg-bg text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  {v === "lista" ? "Lista" : "Painel"}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <DayStrip selected={date} today={today} onSelect={pick} />

        {panel && api.data ? (
          <div className="mt-6">
            <PanelView matches={scoped} />
          </div>
        ) : null}

        <div hidden={panel}>
          <div>
            {api.data ? <LiveStrip matches={liveMatches} selectedId={selectedId} onSelect={setSelectedId} /> : null}

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
            ) : scoped.length === 0 ? (
              <StateMessage title="Nenhum campeonato selecionado" action={{ label: "Mostrar todos os campeonatos", onClick: showAllLeagues }}>
                Marque ao menos um campeonato na lista ao lado para ver os jogos.
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
                  <LeagueSection key={g.league.id} group={g} priority={i === 0} onSelect={setSelectedId} selectedId={selectedId} wide={xl} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detalhe do jogo ao lado da lista (a partir de 768 px). Escolher outro jogo troca o painel; `key` zera a aba aberta. */}
      {split && !panel ? (
        <aside aria-label="Detalhe do jogo" className="sticky top-0 h-dvh w-[22rem] shrink-0 overflow-y-auto border-l border-line px-5 pb-10 pt-4 min-[1000px]:w-[24rem] min-[1000px]:px-6 min-[1200px]:w-[28rem]">
          {selectedId ? (
            <MatchView key={selectedId} id={selectedId} initial={null} embedded />
          ) : (
            <div className="grid h-full place-items-center text-center">
              <p className="max-w-[26ch] text-muted">Escolha um jogo na lista para ver o placar, os lances e como cada time chega.</p>
            </div>
          )}
        </aside>
      ) : null}
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
