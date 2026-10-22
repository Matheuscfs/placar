import { getLeagueDef } from "@/lib/domain/leagues";
import type { LeagueId, Match } from "@/lib/domain/types";

/** Quantos jogos a página do time mostra em cada bloco. */
export const RECENT_LIMIT = 5;
export const UPCOMING_LIMIT = 5;

export const byKickoff = (a: Match, b: Match) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id);

const defaultUpcoming = (m: Match) => m.status === "scheduled" || m.status === "live" || m.status === "halftime";

/**
 * Separa os jogos de um time em "últimos resultados" (mais recente primeiro) e "próximos
 * jogos" (mais próximo primeiro). `isUpcoming` deixa a fonte decidir o que ainda está por vir
 * (o openfootball, por exemplo, não tem status ao vivo e precisa olhar a data).
 */
export function splitTeamMatches(matches: Match[], isUpcoming: (m: Match) => boolean = defaultUpcoming) {
  return {
    recent: matches.filter((m) => m.status === "finished").sort((a, b) => byKickoff(b, a)).slice(0, RECENT_LIMIT),
    upcoming: matches.filter(isUpcoming).sort(byKickoff).slice(0, UPCOMING_LIMIT),
    leagueIds: [...new Set(matches.map((m) => m.leagueId))],
  };
}

/**
 * Liga de pontos corridos "atual" do time, que dá a posição na página: a do próximo jogo
 * e, na falta de jogos futuros, a do mais recente. Copas não têm tabela única e são puladas.
 */
export function currentLeague(upcoming: Match[], recent: Match[]): LeagueId | null {
  return [...upcoming, ...recent].find((m) => getLeagueDef(m.leagueId).kind === "league")?.leagueId ?? null;
}
