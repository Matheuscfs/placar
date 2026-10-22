import Link from "next/link";
import type { Match, MatchSide } from "@/lib/domain/types";
import { hasScore, matchSummary, statusView, winnerOf } from "@/lib/ui/format";
import { canSplit } from "@/lib/ui/viewport";
import { Crest } from "./crest";
import { StarIcon } from "./icons";
import { ScoreNumber } from "./score-number";
import { StatusCell } from "./status-cell";

function TeamName({ side, dim, favorite, priority, reverse = false }: { side: MatchSide; dim: boolean; favorite: boolean; priority: boolean; reverse?: boolean }) {
  // `reverse`: o time da esquerda numa linha larga fica encostado no placar (nome, depois escudo).
  return (
    <span className={`flex min-w-0 items-center gap-3 ${reverse ? "flex-row-reverse" : ""}`}>
      <Crest team={side.team} size={28} priority={priority} />
      <span className={`truncate text-[1.02rem] ${dim ? "font-normal text-muted" : "font-semibold"}`}>{side.team.name}</span>
      {favorite ? <StarIcon filled width={13} height={13} className="shrink-0 text-faint" /> : null}
    </span>
  );
}

function Score({ side, dim }: { side: MatchSide; dim: boolean }) {
  return (
    <span className={`score flex items-center justify-end text-[1.4rem] ${dim ? "text-muted" : ""}`}>
      {side.penalties !== null ? <span className="num mr-1.5 text-xs font-medium not-italic text-muted">({side.penalties})</span> : null}
      {side.score !== null ? <ScoreNumber value={side.score} /> : null}
    </span>
  );
}

/** Penais, quando houve, ficam ao lado do número do placar. */
function WideScore({ match }: { match: Match }) {
  const { home, away } = match;
  const pens = home.penalties !== null && away.penalties !== null;
  return (
    <span className="flex flex-col items-center">
      <span className="score flex items-center gap-1.5 text-[1.4rem]">
        <ScoreNumber value={home.score ?? 0} />
        <span aria-hidden className="text-muted">–</span>
        <ScoreNumber value={away.score ?? 0} />
      </span>
      {pens ? <span className="num text-xs text-muted">({home.penalties}) – ({away.penalties})</span> : null}
    </span>
  );
}

/**
 * Uma linha de jogo. Padrão (celular e tablet): mandante em cima, visitante embaixo; placares em coluna
 * à direita; situação no extremo. `wide` (computador): tudo numa linha, como no desenho V2: situação,
 * mandante, placar no meio, visitante. O perdedor de um jogo encerrado fica mais suave — isso também é
 * informação. `isFavorite` marca times favoritos com uma estrela discreta.
 */
export function MatchRow({
  match,
  showDate = false,
  isFavorite = () => false,
  priority = false,
  onSelect,
  selected = false,
  wide = false,
}: {
  match: Match;
  showDate?: boolean;
  isFavorite?: (teamKey: string) => boolean;
  priority?: boolean;
  /** Em telas largas, tocar no jogo abre o detalhe ao lado em vez de trocar de página (o link continua valendo para abrir em outra aba). */
  onSelect?: (id: string) => void;
  selected?: boolean;
  wide?: boolean;
}) {
  const status = statusView(match, { showDate });
  const winner = winnerOf(match);
  const score = hasScore(match);
  const state = selected ? "bg-surface shadow-[inset_3px_0_0_var(--live)]" : "";

  return (
    <Link
      href={`/jogo/${match.id}`}
      aria-label={matchSummary(match)}
      aria-current={selected ? "true" : undefined}
      onClick={(e) => {
        if (!onSelect || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !canSplit()) return;
        e.preventDefault();
        onSelect(match.id);
      }}
      className={
        wide
          ? `-mx-3 grid min-h-14 grid-cols-[4.5rem_minmax(0,1fr)_6.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-2xl px-3 py-2 transition-colors hover:bg-surface active:bg-surface ${state}`
          : `-mx-3 grid grid-cols-[minmax(0,1fr)_auto_4.5rem] grid-rows-[1.75rem_1.75rem] items-center gap-x-3 gap-y-2.5 rounded-2xl px-3 py-3 transition-colors hover:bg-surface active:bg-surface ${state}`
      }
    >
      {wide ? (
        <>
          <StatusCell status={status} align="left" />
          <TeamName side={match.home} dim={winner === "away"} favorite={isFavorite(match.home.team.key)} priority={priority} reverse />
          {score ? <WideScore match={match} /> : <span aria-hidden className="text-center text-muted">–</span>}
          <TeamName side={match.away} dim={winner === "home"} favorite={isFavorite(match.away.team.key)} priority={priority} />
        </>
      ) : (
        <>
          <TeamName side={match.home} dim={winner === "away"} favorite={isFavorite(match.home.team.key)} priority={priority} />
          {score ? <Score side={match.home} dim={winner === "away"} /> : <span />}
          <span className="row-span-2 row-start-1 col-start-3 self-center">
            <StatusCell status={status} />
          </span>
          <TeamName side={match.away} dim={winner === "home"} favorite={isFavorite(match.away.team.key)} priority={priority} />
          {score ? <Score side={match.away} dim={winner === "home"} /> : <span />}
        </>
      )}
    </Link>
  );
}
