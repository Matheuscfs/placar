import { LEAGUES, toPublicLeague } from "@/lib/domain/leagues";
import type { League, LeagueId, Match } from "@/lib/domain/types";
import { isFavoriteLeague, isFavoriteTeam, type Favorites } from "./favorites";

/** Catálogo no formato público, já no cliente: nomes de liga não precisam de uma chamada à API. */
export const PUBLIC_LEAGUES: readonly League[] = [...LEAGUES].sort((a, b) => a.order - b.order).map(toPublicLeague);
const BY_ID = new Map<LeagueId, League>(PUBLIC_LEAGUES.map((l) => [l.id, l]));

export const leagueById = (id: LeagueId): League | undefined => BY_ID.get(id);

export interface LeagueGroup {
  league: League;
  favorite: boolean;
  matches: Match[];
}

/** Algum dos dois times do jogo é favorito? */
export const involvesFavorite = (m: Match, f: Favorites) => isFavoriteTeam(f, m.home.team.key) || isFavoriteTeam(f, m.away.team.key);

/**
 * Agrupa os jogos por liga para a tela inicial. Ligas favoritas vêm primeiro; dentro de cada
 * liga, jogos de times favoritos vêm primeiro; o resto segue por horário. Liga sem jogos some.
 */
export function groupMatches(matches: readonly Match[], favorites: Favorites): LeagueGroup[] {
  const byLeague = new Map<LeagueId, Match[]>();
  for (const m of matches) (byLeague.get(m.leagueId) ?? byLeague.set(m.leagueId, []).get(m.leagueId)!).push(m);

  const groups: LeagueGroup[] = [];
  for (const league of PUBLIC_LEAGUES) {
    const list = byLeague.get(league.id);
    if (!list?.length) continue;
    const sorted = [...list].sort(
      (a, b) => Number(involvesFavorite(b, favorites)) - Number(involvesFavorite(a, favorites)) || a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id),
    );
    groups.push({ league, favorite: isFavoriteLeague(favorites, league.id), matches: sorted });
  }
  // sort estável: dentro de cada bloco (favoritas / demais) a ordem do catálogo se mantém
  return groups.sort((a, b) => Number(b.favorite) - Number(a.favorite));
}

export const hasLive = (matches: readonly Match[]) => matches.some((m) => m.status === "live" || m.status === "halftime");
