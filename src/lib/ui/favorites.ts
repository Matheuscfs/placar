import { isLeagueId } from "@/lib/domain/leagues";
import type { LeagueId, Team } from "@/lib/domain/types";

/**
 * Favoritos ficam no aparelho (localStorage). O time é guardado pela CHAVE estável (`Team.key`,
 * a mesma em todas as fontes) mais o que é preciso para listá-lo e abri-lo sem consultar a API.
 * Sincronizar com conta é uma fase posterior.
 */
export interface FavoriteTeam {
  key: string;
  /** Id qualificado, para abrir a página do time. */
  id: string;
  name: string;
  logo?: string;
}

export interface Favorites {
  teams: FavoriteTeam[];
  leagues: LeagueId[];
}

export const EMPTY_FAVORITES: Favorites = Object.freeze({ teams: [], leagues: [] }) as Favorites;
export const FAVORITES_KEY = "placar:favoritos:v1";

const isTeam = (t: unknown): t is FavoriteTeam => {
  if (!t || typeof t !== "object") return false;
  const x = t as Record<string, unknown>;
  return typeof x.key === "string" && x.key !== "" && typeof x.id === "string" && x.id !== "" && typeof x.name === "string" && (x.logo === undefined || typeof x.logo === "string");
};

/** Lê o que está salvo, sem confiar nele: qualquer coisa fora do formato é descartada. */
export function parseFavorites(raw: string | null): Favorites {
  if (!raw) return EMPTY_FAVORITES;
  try {
    const j = JSON.parse(raw) as { teams?: unknown; leagues?: unknown };
    const seen = new Set<string>();
    const teams = (Array.isArray(j.teams) ? j.teams : []).filter(isTeam).filter((t) => !seen.has(t.key) && seen.add(t.key));
    const leagues = [...new Set((Array.isArray(j.leagues) ? j.leagues : []).filter((l): l is LeagueId => typeof l === "string" && isLeagueId(l)))];
    return teams.length || leagues.length ? { teams, leagues } : EMPTY_FAVORITES;
  } catch {
    return EMPTY_FAVORITES;
  }
}

export const serializeFavorites = (f: Favorites) => JSON.stringify({ teams: f.teams, leagues: f.leagues });

export const isFavoriteTeam = (f: Favorites, key: string) => f.teams.some((t) => t.key === key);
export const isFavoriteLeague = (f: Favorites, id: LeagueId) => f.leagues.includes(id);

export function toFavoriteTeam(team: Pick<Team, "key" | "id" | "name" | "logo">): FavoriteTeam {
  const fav: FavoriteTeam = { key: team.key, id: team.id, name: team.name };
  if (team.logo) fav.logo = team.logo;
  return fav;
}

/** Liga/desliga um time. Ao ligar, o mais novo vai para o começo da lista. */
export function toggleTeam(f: Favorites, team: FavoriteTeam): Favorites {
  const teams = isFavoriteTeam(f, team.key) ? f.teams.filter((t) => t.key !== team.key) : [team, ...f.teams];
  return { ...f, teams };
}

export function toggleLeague(f: Favorites, id: LeagueId): Favorites {
  return { ...f, leagues: f.leagues.includes(id) ? f.leagues.filter((l) => l !== id) : [...f.leagues, id] };
}
