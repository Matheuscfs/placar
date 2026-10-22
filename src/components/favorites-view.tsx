"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PUBLIC_LEAGUES } from "@/lib/ui/leagues";
import { useFavorites } from "@/lib/ui/use-favorites";
import { Crest } from "./crest";
import { FavoriteButton } from "./favorite-button";
import { StarIcon } from "./icons";
import { PushToggle } from "./push-toggle";

const subscribeNothing = () => () => undefined;

export function FavoritesView() {
  const { favorites, isLeague, toggleLeague, toggleTeam } = useFavorites();
  // O servidor não enxerga o localStorage: antes de hidratar, "nenhum time" seria uma informação falsa.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);

  return (
    <div className="pt-3">
      <h1 className="text-[2rem] font-bold leading-tight">Favoritos</h1>
      <p className="mt-2 max-w-[40ch] text-muted">Ligas e times favoritos aparecem primeiro na tela inicial. Ficam salvos neste aparelho.</p>

      <section className="mt-10" aria-labelledby="fav-times">
        <h2 id="fav-times" className="text-[1.35rem] font-bold">Times</h2>
        {!hydrated ? (
          <div className="mt-3 h-[3.25rem]" aria-hidden />
        ) : favorites.teams.length === 0 ? (
          <p className="mt-3 max-w-[42ch] text-muted">
            Você ainda não favoritou nenhum time. Abra a página de um time, ou um jogo, e toque na estrela <StarIcon width={15} height={15} className="inline align-[-2px]" />.
          </p>
        ) : (
          <ul className="mt-2">
            {favorites.teams.map((t) => (
              <li key={t.key} className="flex items-center gap-3 py-1.5">
                <Link href={`/time/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1.5 hover:bg-surface">
                  <Crest team={t} size={32} />
                  <span className="truncate text-[1.02rem] font-semibold">{t.name}</span>
                </Link>
                <FavoriteButton pressed onToggle={() => toggleTeam(t)} name={t.name} className="-mr-3" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <PushToggle teamKeys={favorites.teams.map((t) => t.key)} />

      <section className="mt-10" aria-labelledby="fav-ligas">
        <h2 id="fav-ligas" className="text-[1.35rem] font-bold">Ligas</h2>
        <ul className="mt-2">
          {PUBLIC_LEAGUES.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-1">
              <Link href={`/liga/${l.id}`} className="min-w-0 flex-1 rounded-2xl py-2 hover:bg-surface">
                <span className="block truncate text-[1.02rem] font-semibold">{l.name}</span>
                <span className="block text-sm text-muted">{l.country}</span>
              </Link>
              <FavoriteButton pressed={isLeague(l.id)} onToggle={() => toggleLeague(l.id)} name={l.shortName} className="-mr-3" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
