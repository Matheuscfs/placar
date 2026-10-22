"use client";

import Link from "next/link";
import { useId } from "react";
import type { Match } from "@/lib/domain/types";
import type { LeagueGroup } from "@/lib/ui/leagues";
import { useFavorites } from "@/lib/ui/use-favorites";
import { FavoriteButton } from "./favorite-button";
import { MatchRow } from "./match-row";

/** Uma liga e seus jogos. O nome leva à classificação; a estrela favorita a liga. */
export function LeagueSection({
  group,
  showDate = false,
  priority = false,
  onSelect,
  selectedId,
}: {
  group: LeagueGroup;
  showDate?: boolean;
  priority?: boolean;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  const id = useId();
  const { isLeague, toggleLeague, isTeam } = useFavorites();
  const { league } = group;

  return (
    <section aria-labelledby={id} className="mt-9 first:mt-3">
      <div className="mb-1 flex items-center justify-between">
        <h2 id={id} className="text-[1.05rem] font-bold">
          <Link href={`/liga/${league.id}`} className="-m-1 p-1 hover:underline hover:decoration-line hover:underline-offset-4">
            {league.name}
          </Link>
        </h2>
        <FavoriteButton pressed={isLeague(league.id)} onToggle={() => toggleLeague(league.id)} name={league.shortName} className="-mr-3" />
      </div>
      <div>
        {group.matches.map((m: Match, i) => (
          // Os escudos da primeira tela carregam já, sem esperar a rolagem: nada "pisca" ao abrir.
          <MatchRow key={m.id} match={m} showDate={showDate} isFavorite={isTeam} priority={priority && i < 6} onSelect={onSelect} selected={selectedId === m.id} />
        ))}
      </div>
    </section>
  );
}
