import { DataSourceError } from "@/lib/data/errors";
import type { DataSource, SourceCapabilities, TeamQuery } from "@/lib/data/data-source";
import { currentLeague, splitTeamMatches } from "@/lib/data/team-helpers";
import { isIsoDate, isOnDate, todayIso } from "@/lib/domain/dates";
import { parseId } from "@/lib/domain/ids";
import { getLeagueDef, isLeagueId, leaguesForSource, toPublicLeague, type LeagueDef } from "@/lib/domain/leagues";
import type { IsoDate, League, LeagueId, Match, MatchDetail, Standings, TeamDetail } from "@/lib/domain/types";
import { OpenFootballClient } from "./client";
import { fillPath, matchesFromSeason, seasonLabelFor, seasonStartYear, standingsFromMatches } from "./convert";

export interface OpenFootballSourceOptions {
  /** Relógio injetável (testes). */
  now?: () => Date;
}

/**
 * Conector do openfootball (fonte BASE): calendário e resultados finais, sem ao vivo, sem
 * escudos, sem eventos/escalações/estatísticas. Os arquivos são atualizados em lote (dias ou
 * semanas de atraso — a Série A 2026 parou em 20/09), então os dados podem estar defasados:
 * jogo antigo sem resultado aparece como "agendado".
 *
 * Sem cache nem controle de cota — isso é do orquestrador.
 */
export class OpenFootballSource implements DataSource {
  readonly id = "openfootball" as const;
  readonly capabilities: SourceCapabilities = { live: false, events: false, lineups: false, statistics: false, standings: true, crests: false };
  private readonly client: OpenFootballClient;
  private readonly now: () => Date;

  constructor(client: OpenFootballClient = new OpenFootballClient(), opts: OpenFootballSourceOptions = {}) {
    this.client = client;
    this.now = opts.now ?? (() => new Date());
  }

  supportsLeague(leagueId: LeagueId): boolean {
    return getLeagueDef(leagueId).sources.openfootball !== undefined;
  }

  async getLeagues(): Promise<League[]> {
    return leaguesForSource("openfootball").map(toPublicLeague);
  }

  private targetLeagues(leagueIds?: LeagueId[]): LeagueDef[] {
    if (!leagueIds) return leaguesForSource("openfootball");
    const covered = leagueIds.map(getLeagueDef).filter((l) => l.sources.openfootball !== undefined);
    if (covered.length === 0) throw new DataSourceError("unsupported", "O openfootball não cobre nenhuma das ligas pedidas", { source: "openfootball" });
    return covered;
  }

  /**
   * Todos os jogos de uma temporada. Tenta o JSON e, se o arquivo não existir (404), o TXT —
   * é o caso da Libertadores 2026, que só existe em TXT.
   */
  private async seasonMatches(league: LeagueDef, season: string): Promise<Match[]> {
    const cfg = league.sources.openfootball;
    if (!cfg) throw new DataSourceError("unsupported", `O openfootball não cobre ${league.id}`, { source: "openfootball" });
    const ctx = { league, season, timeZone: cfg.timezone };

    if (cfg.json) {
      try {
        return matchesFromSeason((await this.client.json(fillPath(cfg.json, season))).matches, ctx);
      } catch (e) {
        if (!(e instanceof DataSourceError && e.kind === "not_found" && cfg.txt)) throw e;
      }
    }
    if (cfg.txt) return matchesFromSeason((await this.client.txt(fillPath(cfg.txt, season), seasonStartYear(season))).matches, ctx);
    throw new DataSourceError("not_found", `Sem arquivo do openfootball para ${league.id} ${season}`, { source: "openfootball" });
  }

  async getMatchesByDate(date: IsoDate, leagueIds?: LeagueId[]): Promise<Match[]> {
    if (!isIsoDate(date)) throw new DataSourceError("invalid_id", `Data inválida: ${date}`, { source: "openfootball" });
    const leagues = this.targetLeagues(leagueIds);
    const results = await Promise.allSettled(leagues.map((l) => this.seasonMatches(l, seasonLabelFor(l, date))));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (ok.length === 0) {
      const first = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      throw first?.reason ?? new DataSourceError("not_found", "O openfootball não tem dados para esta data", { source: "openfootball" });
    }
    return ok
      .flat()
      .filter((m) => isOnDate(m.kickoff, date))
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
  }

  async getLiveMatches(): Promise<Match[]> {
    throw new DataSourceError("unsupported", "O openfootball não tem jogos ao vivo", { source: "openfootball" });
  }

  async getMatch(id: string): Promise<MatchDetail> {
    const { source, parts } = parseId(id);
    if (source !== "openfootball" || parts.length !== 3 || !isLeagueId(parts[0])) {
      throw new DataSourceError("invalid_id", `Id de partida inválido para o openfootball: "${id}"`, { source: "openfootball" });
    }
    const league = getLeagueDef(parts[0]);
    if (!league.sources.openfootball) throw new DataSourceError("unsupported", `O openfootball não cobre ${league.id}`, { source: "openfootball" });

    const match = (await this.seasonMatches(league, parts[1])).find((m) => m.id === id);
    if (!match) throw new DataSourceError("not_found", `Partida ${id} não encontrada`, { source: "openfootball" });
    // Só placar: nada de árbitro, público, eventos, escalações ou estatísticas.
    return { ...match, referee: null, attendance: null, events: [], lineups: [], statistics: [] };
  }

  private currentSeason(league: LeagueDef): string {
    return seasonLabelFor(league, todayIso(this.now()));
  }

  async getStandings(leagueId: LeagueId): Promise<Standings> {
    const league = getLeagueDef(leagueId);
    if (!league.sources.openfootball) throw new DataSourceError("unsupported", `O openfootball não cobre ${leagueId}`, { source: "openfootball" });
    // Copas (grupos, mata-mata) não têm tabela única calculável a partir do arquivo.
    if (league.kind !== "league") throw new DataSourceError("unsupported", `Sem classificação calculada para a copa ${leagueId}`, { source: "openfootball" });
    const season = this.currentSeason(league);
    return standingsFromMatches(await this.seasonMatches(league, season), league, season);
  }

  async getTeam(id: string, query: TeamQuery = {}): Promise<TeamDetail> {
    const { source, parts } = parseId(id);
    if (source !== "openfootball" || parts.length !== 1) {
      throw new DataSourceError("invalid_id", `Id de time inválido para o openfootball: "${id}"`, { source: "openfootball" });
    }
    // Sem dica de liga, procura nas ligas de pontos corridos (as copas não têm "o time" de um lugar só).
    const leagues = query.leagueId ? this.targetLeagues([query.leagueId]) : this.targetLeagues().filter((l) => l.kind === "league");

    const loaded = await Promise.allSettled(leagues.map(async (l) => ({ league: l, season: this.currentSeason(l), matches: await this.seasonMatches(l, this.currentSeason(l)) })));
    const seasons = loaded.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (seasons.length === 0) {
      const first = loaded.find((r): r is PromiseRejectedResult => r.status === "rejected");
      throw first?.reason ?? new DataSourceError("not_found", `Time ${id} não encontrado`, { source: "openfootball" });
    }

    const mine = seasons.map((s) => ({ ...s, matches: s.matches.filter((m) => m.home.team.id === id || m.away.team.id === id) })).filter((s) => s.matches.length > 0);
    const all = mine.flatMap((s) => s.matches);
    const team = all[0] && (all[0].home.team.id === id ? all[0].home.team : all[0].away.team);
    if (!team) throw new DataSourceError("not_found", `Time ${id} não encontrado no openfootball`, { source: "openfootball" });

    // "Por vir" = agendado e ainda não passou; jogo antigo sem resultado é dado defasado, não futuro.
    const nowIso = this.now().toISOString();
    const { recent, upcoming, leagueIds } = splitTeamMatches(all, (m) => m.status === "scheduled" && m.kickoff >= nowIso);

    const leagueId = query.leagueId ?? currentLeague(upcoming, recent);
    const found = mine.find((s) => s.league.id === leagueId);
    let standing: TeamDetail["standing"] = null;
    if (found && found.league.kind === "league") {
      // Reaproveita os jogos já baixados (a tabela é calculada) em vez de baixar de novo.
      const full = seasons.find((s) => s.league.id === found.league.id)!;
      const row = standingsFromMatches(full.matches, found.league, full.season).groups[0].rows.find((r) => r.team.id === id);
      if (row) standing = { leagueId: found.league.id, row };
    }
    return { team, leagueIds, upcoming, recent, standing };
  }
}
