"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Match } from "@/lib/domain/types";
import { formatTime, matchSummary, statusView, winnerOf } from "@/lib/ui/format";
import { isLiveMatch } from "@/lib/ui/filters";
import { leagueById } from "@/lib/ui/leagues";
import { useNow } from "@/lib/ui/use-now";
import { Countdown } from "./match/countdown";
import { Crest } from "./crest";
import { ScoreNumber } from "./score-number";
import { broadcastFor } from "@/lib/domain/broadcasts";

function PanelCard({ m }: { m: Match }) {
  const status = statusView(m);
  const league = leagueById(m.leagueId);
  const winner = winnerOf(m);
  const row = (side: Match["home"], dim: boolean) => (
    <span className={`grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 text-[1.15rem] ${dim ? "font-normal text-muted" : "font-semibold"}`}>
      <Crest team={side.team} size={32} />
      <span className="truncate">{side.team.name}</span>
      <span className="score text-[2.2rem]">{side.score !== null ? <ScoreNumber value={side.score} /> : null}</span>
    </span>
  );
  return (
    <Link href={`/jogo/${m.id}`} aria-label={matchSummary(m)} className="flex min-w-0 flex-col justify-between gap-4 rounded-3xl bg-surface p-5 transition-colors hover:bg-line">
      <span className="flex items-center justify-between text-sm font-bold">
        <span className="truncate pr-2 font-medium text-muted">{league?.shortName}</span>
        <span className="num flex shrink-0 items-center gap-2 text-live">
          <span aria-hidden className="live-dot" />
          {status.label}
        </span>
      </span>
      {row(m.home, winner === "away")}
      {row(m.away, winner === "home")}
    </Link>
  );
}

/**
 * Modo painel, para tela grande (computador no canto da mesa, TV): todos os jogos ao vivo de uma vez, em
 * cartões grandes que se reorganizam pela largura, e "A seguir" com o próximo jogo e onde passa. É só para
 * olhar, por isso não tem detalhe ao lado: cada cartão leva à página do jogo.
 */
export function PanelView({ matches }: { matches: Match[] }) {
  const now = useNow(30_000);
  const live = useMemo(() => matches.filter(isLiveMatch), [matches]);
  const next = useMemo(() => {
    if (now === null) return null;
    return matches.filter((m) => m.status === "scheduled" && Date.parse(m.kickoff) > now).sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0] ?? null;
  }, [matches, now]);
  const nextBroadcast = next ? broadcastFor(next.leagueId) : null;

  return (
    <div className="grid gap-8 min-[1500px]:grid-cols-[minmax(0,1fr)_22rem]" data-no-swipe>
      <section aria-labelledby="painel-ao-vivo">
        <h2 id="painel-ao-vivo" className="mb-3 flex items-center gap-2 text-[1.05rem] font-bold">
          <span aria-hidden className="live-dot" />
          Ao vivo agora
          {live.length > 0 ? <span className="num font-medium text-muted">{live.length === 1 ? "1 jogo" : `${live.length} jogos`}</span> : null}
        </h2>
        {live.length > 0 ? (
          <ul className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(19rem,1fr))]">
            {live.map((m) => (
              <li key={m.id} className="flex *:w-full">
                <PanelCard m={m} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="max-w-[46ch] text-muted">Nenhum jogo ao vivo agora. Quando um jogo começar, ele aparece aqui.</p>
        )}
      </section>

      <aside aria-labelledby="painel-a-seguir">
        <h2 id="painel-a-seguir" className="mb-3 text-[1.05rem] font-bold">
          A seguir
        </h2>
        {next ? (
          <Link href={`/jogo/${next.id}`} aria-label={matchSummary(next)} className="flex flex-col gap-3 rounded-3xl bg-surface p-6 transition-colors hover:bg-line">
            <span className="text-sm text-muted">
              {leagueById(next.leagueId)?.name}
              {next.round ? ` · ${next.round}` : ""}
            </span>
            {[next.home, next.away].map((s) => (
              <span key={s.team.key} className="flex items-center gap-3 text-[1.2rem] font-bold">
                <Crest team={s.team} size={36} />
                <span className="truncate">{s.team.name}</span>
              </span>
            ))}
            <span className="num mt-1 text-[2.6rem] font-extrabold leading-none">{formatTime(next.kickoff)}</span>
            <Countdown kickoff={next.kickoff} />
            {nextBroadcast ? (
              <span className="text-[0.95rem]">
                <span className="text-muted">Costuma passar em </span>
                <span className="font-medium">{nextBroadcast.channels.join(", ")}</span>
              </span>
            ) : null}
          </Link>
        ) : (
          <p className="max-w-[40ch] text-muted">Não há mais jogos a começar neste dia.</p>
        )}
      </aside>
    </div>
  );
}
