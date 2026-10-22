import Link from "next/link";
import type { Match, MatchSide } from "@/lib/domain/types";
import { hasScore, matchSummary, statusView, winnerOf } from "@/lib/ui/format";
import { canSplit } from "@/lib/ui/viewport";
import { Crest } from "./crest";
import { StarIcon } from "./icons";
import { ScoreNumber } from "./score-number";
import { StatusCell } from "./status-cell";

function TeamName({ side, dim, favorite, priority }: { side: MatchSide; dim: boolean; favorite: boolean; priority: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
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

/**
 * Uma linha de jogo: mandante em cima, visitante embaixo; placares em coluna à direita; situação
 * no extremo. O perdedor de um jogo encerrado fica mais suave — isso também é informação.
 * `isFavorite` marca times favoritos com uma estrela discreta.
 */
export function MatchRow({
  match,
  showDate = false,
  isFavorite = () => false,
  priority = false,
  onSelect,
  selected = false,
}: {
  match: Match;
  showDate?: boolean;
  isFavorite?: (teamKey: string) => boolean;
  priority?: boolean;
  /** Em telas largas, tocar no jogo abre o detalhe ao lado em vez de trocar de página (o link continua valendo para abrir em outra aba). */
  onSelect?: (id: string) => void;
  selected?: boolean;
}) {
  const status = statusView(match, { showDate });
  const winner = winnerOf(match);
  const score = hasScore(match);

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
      className={`-mx-3 grid grid-cols-[minmax(0,1fr)_auto_4.5rem] grid-rows-[1.75rem_1.75rem] items-center gap-x-3 gap-y-2.5 rounded-2xl px-3 py-3 transition-colors hover:bg-surface active:bg-surface ${selected ? "bg-surface shadow-[inset_3px_0_0_var(--live)]" : ""}`}
    >
      <TeamName side={match.home} dim={winner === "away"} favorite={isFavorite(match.home.team.key)} priority={priority} />
      {score ? <Score side={match.home} dim={winner === "away"} /> : <span />}
      <span className="row-span-2 row-start-1 col-start-3 self-center">
        <StatusCell status={status} />
      </span>
      <TeamName side={match.away} dim={winner === "home"} favorite={isFavorite(match.away.team.key)} priority={priority} />
      {score ? <Score side={match.away} dim={winner === "home"} /> : <span />}
    </Link>
  );
}
