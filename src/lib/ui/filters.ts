import type { Match } from "@/lib/domain/types";
import type { Favorites } from "./favorites";
import { involvesFavorite, leagueById } from "./leagues";

/** Filtros da tela inicial: sem lógica de tela, para poder testar. */

export type StatusFilter = "todos" | "ao-vivo" | "favoritos";

export const isLiveMatch = (m: Match): boolean => m.status === "live" || m.status === "halftime";

/** Sem acento, minúsculo e sem espaços nas pontas: "Grêmio " e "gremio" são a mesma busca. */
export function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * O jogo combina com a busca? Cada palavra da busca precisa aparecer em algum lugar do jogo (nome, nome curto ou
 * sigla de qualquer um dos times, nome/sigla/país da competição), em qualquer ordem: "fla liberta" acha
 * Flamengo na Libertadores. Busca vazia combina com tudo.
 */
export function matchesQuery(m: Match, query: string): boolean {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const league = leagueById(m.leagueId);
  const haystack = normalizeText(
    [m.home.team.name, m.home.team.shortName, m.home.team.abbr, m.away.team.name, m.away.team.shortName, m.away.team.abbr, league?.name, league?.shortName, league?.country, m.round].filter(Boolean).join(" "),
  );
  return tokens.every((t) => haystack.includes(t));
}

export interface FilterOptions {
  status: StatusFilter;
  query: string;
  favorites: Favorites;
}

export function filterMatches(matches: readonly Match[], { status, query, favorites }: FilterOptions): Match[] {
  return matches.filter((m) => {
    if (status === "ao-vivo" && !isLiveMatch(m)) return false;
    if (status === "favoritos" && !involvesFavorite(m, favorites)) return false;
    return matchesQuery(m, query);
  });
}
