"use client";

import Link from "next/link";
import type { Match } from "@/lib/domain/types";
import { matchSummary, statusView } from "@/lib/ui/format";
import { leagueById } from "@/lib/ui/leagues";
import { useMedia } from "@/lib/ui/use-media";
import { canSplit, SPLIT_QUERY } from "@/lib/ui/viewport";
import { ScoreNumber } from "./score-number";

/**
 * "Ao vivo agora": uma fileira de cartões que rola de lado, com o placar de cada jogo em andamento. Só
 * existe em telas largas (no celular a própria lista já traz os jogos ao vivo e o filtro "Ao vivo").
 * Tocar abre o detalhe ao lado; o link continua valendo para abrir a página do jogo.
 */
export function LiveStrip({ matches, selectedId, onSelect }: { matches: Match[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const wide = useMedia(SPLIT_QUERY);
  if (!wide || matches.length === 0) return null;
  return (
    <section aria-labelledby="ao-vivo-agora" className="mt-6" data-no-swipe>
      <h2 id="ao-vivo-agora" className="mb-2 flex items-center gap-2 text-[0.95rem] font-bold">
        <span aria-hidden className="live-dot" />
        Ao vivo agora
        <span className="num font-medium text-muted">{matches.length === 1 ? "1 jogo" : `${matches.length} jogos`}</span>
      </h2>
      <ul className="no-scrollbar -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
        {matches.map((m) => {
          const status = statusView(m);
          const league = leagueById(m.leagueId);
          return (
            <li key={m.id} className="shrink-0">
              <Link
                href={`/jogo/${m.id}`}
                aria-label={matchSummary(m)}
                aria-current={selectedId === m.id ? "true" : undefined}
                onClick={(e) => {
                  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !canSplit()) return;
                  e.preventDefault();
                  onSelect(m.id);
                }}
                className={`flex w-44 flex-col gap-1.5 rounded-2xl p-3 transition-colors hover:bg-line ${selectedId === m.id ? "bg-line shadow-[inset_0_0_0_2px_var(--live)]" : "bg-surface"}`}
              >
                <span className="flex items-center justify-between text-xs font-bold text-live">
                  <span className="num">{status.label}</span>
                  <span className="truncate pl-2 font-medium text-muted">{league?.shortName}</span>
                </span>
                <span className="flex items-center justify-between gap-2 text-[0.92rem] font-semibold">
                  <span className="truncate">{m.home.team.abbr ?? m.home.team.name}</span>
                  <span className="score text-[1.1rem]">
                    <ScoreNumber value={m.home.score ?? 0} />
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2 text-[0.92rem] font-semibold">
                  <span className="truncate">{m.away.team.abbr ?? m.away.team.name}</span>
                  <span className="score text-[1.1rem]">
                    <ScoreNumber value={m.away.score ?? 0} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
