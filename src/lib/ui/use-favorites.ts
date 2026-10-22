"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useFavoritesSeed } from "@/components/favorites-seed";
import type { LeagueId, Team } from "@/lib/domain/types";
import { isFavoriteLeague, isFavoriteTeam, toFavoriteTeam, toggleLeague, toggleTeam, type Favorites } from "./favorites";
import { getFavoritesSnapshot, setFavorites, subscribeFavorites } from "./favorites-store";

export interface UseFavorites {
  favorites: Favorites;
  isTeam: (key: string) => boolean;
  isLeague: (id: LeagueId) => boolean;
  toggleTeam: (team: Pick<Team, "key" | "id" | "name" | "logo">) => void;
  toggleLeague: (id: LeagueId) => void;
}

export function useFavorites(): UseFavorites {
  // No servidor e na hidratação vale o que o servidor leu do cookie (para a 1ª pintura sair certa); depois, o localStorage.
  const seed = useFavoritesSeed();
  const favorites = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, () => seed);
  const isTeam = useCallback((key: string) => isFavoriteTeam(favorites, key), [favorites]);
  const isLeague = useCallback((id: LeagueId) => isFavoriteLeague(favorites, id), [favorites]);
  // Lê o estado MAIS RECENTE na hora do clique (não o do último render), para dois cliques seguidos não se atropelarem.
  const onToggleTeam = useCallback((team: Pick<Team, "key" | "id" | "name" | "logo">) => setFavorites(toggleTeam(getFavoritesSnapshot(), toFavoriteTeam(team))), []);
  const onToggleLeague = useCallback((id: LeagueId) => setFavorites(toggleLeague(getFavoritesSnapshot(), id)), []);
  return { favorites, isTeam, isLeague, toggleTeam: onToggleTeam, toggleLeague: onToggleLeague };
}
