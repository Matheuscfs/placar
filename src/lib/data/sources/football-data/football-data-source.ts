import { DataSourceError } from "@/lib/data/errors";
import type { DataSource, SourceCapabilities, TeamQuery } from "@/lib/data/data-source";
import { currentLeague, splitTeamMatches } from "@/lib/data/team-helpers";
import { addDays, isIsoDate, isOnDate } from "@/lib/domain/dates";
import { parseId } from "@/lib/domain/ids";
import { findLeagueBySourceCode, getLeagueDef, leaguesForSource, toPublicLeague, type LeagueDef } from "@/lib/domain/leagues";
import type { IsoDate, League, LeagueId, Match, MatchDetail, StandingRow, Standings, TeamDetail } from "@/lib/domain/types";
import { FootballDataClient } from "./client";
import { matchesFromList, standingsFromFd, toMatchDetail } from "./convert";

/**
 * Conector do football-data.org (fonte RESERVA). No plano grátis: só Brasileirão A e as ligas
 * europeias do catálogo; placares com atraso; sem eventos, escalações nem estatísticas
 * (planos pagos). Os conversores já tratam esses campos para quando existirem.
 *
 * Sem `FOOTBALL_DATA_TOKEN` a fonte não cobre nenhuma liga (`supportsLeague` → false), e o
 * orquestrador a ignora. NUNCA foi exercitada contra respostas reais — ver `fd-types.ts`.
 */
export class FootballDataSource implements DataSource {
  readonly id = "football-data" as const;
  readonly capabilities: SourceCapabilities = {
    // Placar em jogo existe (IN_PLAY/PAUSED), mas o grátis é atrasado: só serve de reserva.
    live: false,
    delayedLive: true,
    events: false,
    lineups: false,
    statistics: false,
    standings: true,
    crests: true,
  };
  private readonly client: FootballDataClient;

  constructor(client: FootballDataClient = new FootballDataClient()) {
    this.client = client;
  }

  supportsLeague(leagueId: LeagueId): boolean {
    return this.client.hasToken && getLeagueDef(leagueId).sources["football-data"] !== undefined;
  }

  async getLeagues(): Promise<League[]> {
    return this.client.hasToken ? leaguesForSource("football-data").map(toPublicLeague) : [];
  }

  /** Ligas cobertas pedidas (ou todas). Nenhuma coberta → `unsupported`, sem chamar a rede. */
  private targetLeagues(leagueIds?: LeagueId[]): LeagueDef[] {
    const wanted = leagueIds ? leagueIds.map(getLeagueDef) : leaguesForSource("football-data");
    const covered = wanted.filter((l) => this.supportsLeague(l.id));
    if (covered.length === 0) {
      const why = this.client.hasToken ? "não cobre nenhuma das ligas pedidas" : "está sem FOOTBALL_DATA_TOKEN";
      throw new DataSourceError("unsupported", `football-data.org ${why}`, { source: "football-data" });
    }
    return covered;
  }

  private codes(leagues: LeagueDef[]): string[] {
    return leagues.flatMap((l) => (l.sources["football-data"] ? [l.sources["football-data"]] : []));
  }

  async getMatchesByDate(date: IsoDate, leagueIds?: LeagueId[]): Promise<Match[]> {
    if (!isIsoDate(date)) throw new DataSourceError("invalid_id", `Data inválida: ${date}`, { source: "football-data" });
    // O dia de Brasília (03:00Z → 03:00Z) atravessa duas datas UTC: pede as duas e filtra.
    const list = await this.client.matches({ dateFrom: date, dateTo: addDays(date, 1), competitions: this.codes(this.targetLeagues(leagueIds)) });
    return matchesFromList(list)
      .filter((m) => isOnDate(m.kickoff, date))
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
  }

  async getLiveMatches(leagueIds?: LeagueId[]): Promise<Match[]> {
    const list = await this.client.liveMatches(this.codes(this.targetLeagues(leagueIds)));
    return matchesFromList(list).filter((m) => m.status === "live" || m.status === "halftime");
  }

  async getMatch(id: string): Promise<MatchDetail> {
    const { source, parts } = parseId(id);
    if (source !== "football-data" || parts.length !== 1 || !/^\d+$/.test(parts[0])) {
      throw new DataSourceError("invalid_id", `Id de partida inválido para o football-data.org: "${id}"`, { source: "football-data" });
    }
    const raw = await this.client.match(parts[0]);
    if (raw.competition?.code && !findLeagueBySourceCode("football-data", raw.competition.code)) {
      throw new DataSourceError("unsupported", `Competição fora do catálogo: ${raw.competition.code}`, { source: "football-data" });
    }
    const detail = toMatchDetail(raw);
    if (!detail) throw new DataSourceError("bad_response", `Partida ${id} veio incompleta`, { source: "football-data" });
    return detail;
  }

  async getStandings(leagueId: LeagueId): Promise<Standings> {
    const def = this.targetLeagues([leagueId])[0];
    const standings = standingsFromFd(await this.client.standings(def.sources["football-data"]!), def);
    if (!standings) throw new DataSourceError("not_found", `Sem classificação para ${leagueId}`, { source: "football-data" });
    return standings;
  }

  async getTeam(id: string, query: TeamQuery = {}): Promise<TeamDetail> {
    const { source, parts } = parseId(id);
    if (source !== "football-data" || parts.length !== 1 || !/^\d+$/.test(parts[0])) {
      throw new DataSourceError("invalid_id", `Id de time inválido para o football-data.org: "${id}"`, { source: "football-data" });
    }
    const [finished, scheduled] = await Promise.all([
      this.client.teamMatches(parts[0], { status: "FINISHED", limit: 50 }),
      // Se só os jogos futuros falharem, a página ainda mostra o histórico.
      this.client.teamMatches(parts[0], { status: "SCHEDULED,TIMED", limit: 10 }).catch(() => null),
    ]);

    const all = new Map<string, Match>();
    for (const m of [...matchesFromList(finished), ...matchesFromList(scheduled)]) all.set(m.id, m);
    const matches = [...all.values()];
    // A resposta de jogos do time não traz o objeto do time: ele vem das partidas em que aparece.
    const team = matches.map((m) => (m.home.team.id === id ? m.home.team : m.away.team.id === id ? m.away.team : null)).find((t) => t !== null);
    if (!team) throw new DataSourceError("not_found", `Time ${id} sem jogos no football-data.org`, { source: "football-data" });

    const { recent, upcoming, leagueIds } = splitTeamMatches(matches);
    const leagueId = query.leagueId ?? currentLeague(upcoming, recent);
    let standing: TeamDetail["standing"] = null;
    if (leagueId && this.supportsLeague(leagueId)) {
      try {
        for (const g of (await this.getStandings(leagueId)).groups) {
          const row: StandingRow | undefined = g.rows.find((r) => r.team.id === id);
          if (row) {
            standing = { leagueId, row };
            break;
          }
        }
      } catch {
        /* tabela indisponível: segue sem posição */
      }
    }
    return { team, leagueIds, upcoming, recent, standing };
  }
}
