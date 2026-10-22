import { isLeagueId } from "@/lib/domain/leagues";
import type { LeagueId } from "@/lib/domain/types";
import { EMPTY_FAVORITES, type Favorites } from "./favorites";

/**
 * Espelho dos favoritos num cookie, só para o SERVIDOR saber a ordem certa na primeira pintura.
 * Sem ele, a lista nasce sem favoritos (o servidor não enxerga o localStorage) e "pula" quando o
 * navegador reordena. O cookie leva só as chaves (times) e ids (ligas); nomes e escudos continuam
 * no localStorage, que segue sendo a fonte completa. Não é identificador nem dado pessoal.
 */
export const FAVORITES_COOKIE = "placar_fav";
const MAX_TEAMS = 60; // mantém o cookie bem abaixo de 4 KB
const ONE_YEAR_S = 365 * 24 * 3600;

export function encodeFavoritesCookie(f: Favorites): string {
  const payload = { t: f.teams.slice(0, MAX_TEAMS).map((t) => t.key), l: f.leagues };
  return encodeURIComponent(JSON.stringify(payload));
}

/**
 * Lê o cookie sem confiar nele (qualquer um pode editá-lo). Devolve favoritos "magros": os times só têm
 * a chave (`id` vazio, `name` = chave), o suficiente para ordenar e marcar estrelas, NUNCA para listar.
 */
export function decodeFavoritesCookie(raw: string | undefined | null): Favorites {
  if (!raw) return EMPTY_FAVORITES;
  try {
    const j = JSON.parse(decodeURIComponent(raw)) as { t?: unknown; l?: unknown };
    const keys = [...new Set((Array.isArray(j.t) ? j.t : []).filter((k): k is string => typeof k === "string" && k.length > 0 && k.length <= 80))].slice(0, MAX_TEAMS);
    const leagues = [...new Set((Array.isArray(j.l) ? j.l : []).filter((l): l is LeagueId => typeof l === "string" && isLeagueId(l)))];
    return keys.length || leagues.length ? { teams: keys.map((key) => ({ key, id: "", name: key })), leagues } : EMPTY_FAVORITES;
  } catch {
    return EMPTY_FAVORITES;
  }
}

/** Valor do `Set-Cookie`/`document.cookie` para gravar o espelho (`Secure` só em https). */
export function favoritesCookieString(f: Favorites, secure: boolean): string {
  const empty = f.teams.length === 0 && f.leagues.length === 0;
  return `${FAVORITES_COOKIE}=${empty ? "" : encodeFavoritesCookie(f)}; Path=/; Max-Age=${empty ? 0 : ONE_YEAR_S}; SameSite=Lax${secure ? "; Secure" : ""}`;
}
