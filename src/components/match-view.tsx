"use client";

import Link from "next/link";
import { useState } from "react";
import { toZonedIsoDate, todayIso } from "@/lib/domain/dates";
import type { MatchDetail, ResponseMeta, Sourced, Team } from "@/lib/domain/types";
import { formatShortDate, formatTime, hasScore, SOURCE_NAMES, statusView } from "@/lib/ui/format";
import { leagueById } from "@/lib/ui/leagues";
import { nextRefreshMs } from "@/lib/ui/refresh";
import { useApi } from "@/lib/ui/use-api";
import { useFavorites } from "@/lib/ui/use-favorites";
import { Crest } from "./crest";
import { DataNotices, UpdatedAt } from "./data-notices";
import { FavoriteButton } from "./favorite-button";
import { ChevronLeftIcon } from "./icons";
import { LineupBlock } from "./match/lineups";
import { MatchStats } from "./match/match-stats";
import { Timeline } from "./match/timeline";
import { ScoreNumber } from "./score-number";
import { BlockSkeleton } from "./skeletons";
import { StateMessage } from "./state-message";
import { StatusCell } from "./status-cell";
import { Tabs, panelProps, type TabItem } from "./tabs";
import { broadcastFor } from "@/lib/domain/broadcasts";
import { matchShareText } from "@/lib/ui/share";
import { ShareButton } from "./share-button";

type TabId = "resumo" | "escalacoes" | "estatisticas";
const TABS: TabItem<TabId>[] = [
  { id: "resumo", label: "Resumo" },
  { id: "escalacoes", label: "Escalações" },
  { id: "estatisticas", label: "Estatísticas" },
];

/** Por que não há dado: o jogo não começou, ou a fonte usada não informa esse recurso. */
function emptyReason(m: MatchDetail, meta: ResponseMeta, what: string, notStarted: string): string {
  if (m.status === "scheduled") return notStarted;
  if (meta.source !== "espn") return `A fonte usada agora (${SOURCE_NAMES[meta.source]}) não informa ${what}.`;
  return `A fonte não registrou ${what} deste jogo.`;
}

function TeamColumn({ team, isFavorite, onToggle }: { team: Team; isFavorite: boolean; onToggle: () => void }) {
  return (
    <div className="flex min-w-0 flex-col items-center text-center">
      <Link href={`/time/${team.id}`} className="flex flex-col items-center gap-3 rounded-2xl p-1">
        <Crest team={team} size={64} priority />
        <span className="line-clamp-2 min-h-[2.6em] text-[1.02rem] font-bold leading-tight">{team.name}</span>
      </Link>
      <FavoriteButton pressed={isFavorite} onToggle={onToggle} name={team.name} className="-mt-1" />
    </div>
  );
}

function Scoreboard({ m }: { m: MatchDetail }) {
  const status = statusView(m);
  const score = hasScore(m);
  const pens = m.home.penalties !== null && m.away.penalties !== null;
  const agg = m.home.aggregate !== null && m.away.aggregate !== null;

  return (
    <div className="flex flex-col items-center gap-2 pt-3">
      {score ? (
        <p className="score flex items-center gap-2 text-[2.9rem]" aria-label={`Placar: ${m.home.score} a ${m.away.score}`}>
          <ScoreNumber value={m.home.score ?? 0} />
          <span aria-hidden className="text-muted">–</span>
          <ScoreNumber value={m.away.score ?? 0} />
        </p>
      ) : (
        <p className="num text-[2.2rem] font-bold leading-none">{status.kind === "scheduled" ? formatTime(m.kickoff) : status.label}</p>
      )}
      {score ? <StatusCell status={status} align="center" /> : <p className="text-sm text-muted">{status.kind === "scheduled" ? formatShortDate(m.kickoff) : null}</p>}
      {pens ? <p className="num text-sm text-muted">Pênaltis {m.home.penalties} – {m.away.penalties}</p> : null}
      {agg ? <p className="num text-sm text-muted">Agregado {m.home.aggregate} – {m.away.aggregate}</p> : null}
    </div>
  );
}

/** "Onde passa" só interessa antes e durante o jogo; depois de acabar ou se for adiado, some. */
const showsBroadcast = (status: MatchDetail["status"]) => status === "scheduled" || status === "live" || status === "halftime";

export function Facts({ m }: { m: MatchDetail }) {
  const facts: Array<[string, string]> = [];
  if (m.venue) facts.push(["Local", m.venue]);
  if (m.referee) facts.push(["Árbitro", m.referee]);
  if (m.attendance) facts.push(["Público", m.attendance.toLocaleString("pt-BR")]);
  const broadcast = showsBroadcast(m.status) ? broadcastFor(m.leagueId) : null;
  if (facts.length === 0 && !broadcast) return null;
  return (
    <>
      {facts.length > 0 ? (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-[0.95rem]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {broadcast ? (
        <section className="mt-4" aria-labelledby="onde-passa">
          <h2 id="onde-passa" className="text-[0.95rem] font-semibold">Onde passa</h2>
          <p className="mt-1 text-[0.95rem]">
            <span className="text-muted">Costuma passar em </span>
            <span className="font-medium">{broadcast.channels.join(", ")}</span>
          </p>
          {broadcast.note ? <p className="mt-1 max-w-[52ch] text-sm text-muted">{broadcast.note}</p> : null}
        </section>
      ) : null}
    </>
  );
}

export function MatchView({ id, initial }: { id: string; initial: Sourced<MatchDetail> | null }) {
  const [tab, setTab] = useState<TabId>("resumo");
  const { isTeam, toggleTeam } = useFavorites();

  const api = useApi<MatchDetail>(`/api/matches/${id}`, {
    initial,
    initialUrl: `/api/matches/${id}`,
    nextRefreshMs: (data, failures) => {
      const m = data?.data;
      const live = m ? m.status === "live" || m.status === "halftime" : false;
      // Jogo agendado para daqui a pouco: confere de minuto em minuto para pegar o início.
      const startsSoon = m ? m.status === "scheduled" && Date.parse(m.kickoff) - Date.now() < 3 * 3_600_000 : false;
      return nextRefreshMs(data?.meta ?? null, { live, today: startsSoon, failures });
    },
  });

  if (api.loading) return <BlockSkeleton lines={8} />;
  if (!api.data) {
    return (
      <StateMessage tone="error" title="Não foi possível carregar o jogo" action={{ label: "Tentar de novo", onClick: api.refresh }}>
        {api.error ?? "Confira sua conexão e tente de novo."}
      </StateMessage>
    );
  }

  const m = api.data.data;
  const meta = api.data.meta;
  const league = leagueById(m.leagueId);
  const live = m.status === "live" || m.status === "halftime";
  const backDate = toZonedIsoDate(m.kickoff);
  const backHref = backDate === todayIso() ? "/" : `/?d=${backDate}`;
  const lineupFor = (side: "home" | "away") => m.lineups.find((l) => l.side === side);

  return (
    <article className="pt-1">
      <div className="flex items-center justify-between">
        <Link href={backHref} className="-ml-2 inline-flex h-11 items-center gap-1 rounded-full pr-3 text-[0.95rem] font-medium text-muted hover:text-ink">
          <ChevronLeftIcon />
          Jogos
        </Link>
        <ShareButton title={`${m.home.team.name} x ${m.away.team.name} — Placar`} text={matchShareText(m)} />
      </div>

      <header className="mt-1">
        <h1 className="sr-only">
          {m.home.team.name} contra {m.away.team.name}
        </h1>
        {league ? (
          <p className="text-center">
            <Link href={`/liga/${league.id}`} className="text-[0.95rem] font-semibold hover:underline hover:decoration-line hover:underline-offset-4">
              {league.name}
            </Link>
            {m.round ? <span className="mt-0.5 block text-sm text-muted">{m.round}</span> : null}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2">
          <TeamColumn team={m.home.team} isFavorite={isTeam(m.home.team.key)} onToggle={() => toggleTeam(m.home.team)} />
          <Scoreboard m={m} />
          <TeamColumn team={m.away.team} isFavorite={isTeam(m.away.team.key)} onToggle={() => toggleTeam(m.away.team)} />
        </div>
      </header>

      <Facts m={m} />
      {/* "Atualizado há…" só faz sentido enquanto a tela se atualiza sozinha (jogo ao vivo ou prestes a começar). */}
      {live || m.status === "scheduled" ? (
        <div className="mt-3 flex justify-end">
          <UpdatedAt fetchedAt={api.fetchedAt} refreshing={api.refreshing} onRefresh={api.refresh} />
        </div>
      ) : null}
      <DataNotices meta={meta} />

      <div className="mt-6">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Detalhes do jogo" idPrefix="jogo" />

        {tab === "resumo" ? (
          <div {...panelProps("jogo", "resumo")} className="outline-none">
            {m.events.length > 0 ? (
              <Timeline events={m.events} live={live} homeName={m.home.team.name} awayName={m.away.team.name} />
            ) : (
              <StateMessage title="Sem lances por enquanto">{emptyReason(m, meta, "os lances", "O jogo ainda não começou. Gols, cartões e substituições aparecem aqui durante a partida.")}</StateMessage>
            )}
          </div>
        ) : null}

        {tab === "escalacoes" ? (
          <div {...panelProps("jogo", "escalacoes")} className="outline-none">
            {m.lineups.length > 0 ? (
              <>
                {lineupFor("home") ? <LineupBlock lineup={lineupFor("home")!} team={m.home.team} /> : null}
                {lineupFor("away") ? <LineupBlock lineup={lineupFor("away")!} team={m.away.team} /> : null}
              </>
            ) : (
              <StateMessage title="Escalações não disponíveis">{emptyReason(m, meta, "as escalações", "As escalações costumam sair cerca de uma hora antes do jogo.")}</StateMessage>
            )}
          </div>
        ) : null}

        {tab === "estatisticas" ? (
          <div {...panelProps("jogo", "estatisticas")} className="outline-none">
            {m.statistics.length > 0 ? (
              <MatchStats stats={m.statistics} />
            ) : (
              <StateMessage title="Estatísticas não disponíveis">{emptyReason(m, meta, "as estatísticas", "As estatísticas aparecem quando o jogo começa.")}</StateMessage>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
