import { DataSourceError } from "@/lib/data/errors";
import type { DataSource, SourceCapabilities, TeamQuery } from "@/lib/data/data-source";
import { isIsoDate, isOnDate } from "@/lib/domain/dates";
import { parseId } from "@/lib/domain/ids";
import { findLeagueBySourceCode, getLeagueDef, leaguesForSource, toPublicLeague, type LeagueDef } from "@/lib/domain/leagues";
import type { IsoDate, League, LeagueId, Match, MatchDetail, Standings, StandingRow, TeamDetail } from "@/lib/domain/types";
import { currentLeague, splitTeamMatches, byKickoff } from "@/lib/data/team-helpers";
import { ALL_FEED_LIMIT, EspnClient } from "./client";
import { matchesFromAllFeed, matchesFromScoreboard, matchesFromSchedule, standingsFromEspn, toMatchDetail, toTeam } from "./convert";

/** `2026-10-24` → `20261024`, formato que a ESPN espera. */
const compact = (d: IsoDate) => d.replaceAll("-", "");

function espnSlugOf(def: LeagueDef): string {
  const slug = def.sources.espn;
  if (!slug) throw new DataSourceError("unsupported", `A ESPN não cobre ${def.id}`, { source: "espn" });
  return slug;
}

/**
 * Conector da ESPN (fonte principal). Sem cache nem controle de cota — isso é do orquestrador.
 *
 * Listas de jogos: UMA chamada ao feed global `all/scoreboard` para todas as ligas (em vez de 14,
 * uma por liga), o que mantém o consumo da cota baixo. Se o feed chegar ao teto de 1000 jogos
 * (pode estar incompleto), cai para a consulta liga a liga.
 *
 * Limitação conhecida: a ESPN agrupa os jogos por dia no fuso dos EUA. Filtramos pelo dia de
 * Brasília, então um jogo entre 00h e 01h (02h no horário de inverno dos EUA) de Brasília cai no
 * dia vizinho e não aparece. É raro: as ligas do catálogo não costumam jogar a essa hora.
 */
export class EspnSource implements DataSource {
  readonly id = "espn" as const;
  readonly capabilities: SourceCapabilities = { live: true, events: true, lineups: true, statistics: true, standings: true, crests: true };
  private readonly client: EspnClient;

  constructor(client: EspnClient = new EspnClient()) {
    this.client = client;
  }

  supportsLeague(leagueId: LeagueId): boolean {
    return getLeagueDef(leagueId).sources.espn !== undefined;
  }

  async getLeagues(): Promise<League[]> {
    return leaguesForSource("espn").map(toPublicLeague);
  }

  /** Ligas da consulta que a ESPN cobre. Pedido explícito sem nenhuma coberta → `unsupported`. */
  private targetLeagues(leagueIds?: LeagueId[]): LeagueDef[] {
    if (!leagueIds) return leaguesForSource("espn");
    const covered = leagueIds.map(getLeagueDef).filter((l) => l.sources.espn !== undefined);
    if (covered.length === 0) throw new DataSourceError("unsupported", "A ESPN não cobre nenhuma das ligas pedidas", { source: "espn" });
    return covered;
  }

  /** Uma chamada por liga, em paralelo. Falha parcial devolve o que deu certo; falha total propaga o 1º erro. */
  private async scoreboards(leagues: LeagueDef[], yyyymmdd?: string): Promise<Match[]> {
    const results = await Promise.allSettled(
      leagues.map(async (l) => matchesFromScoreboard(await this.client.scoreboard(espnSlugOf(l), yyyymmdd), l.id, espnSlugOf(l))),
    );
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (ok.length === 0) {
      const first = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      throw first?.reason ?? new DataSourceError("unavailable", "A ESPN não devolveu nenhuma liga", { source: "espn" });
    }
    return ok.flat();
  }

  /** Feed global filtrado para as ligas pedidas; liga a liga só se o feed estourar o teto. */
  private async fromFeed(leagues: LeagueDef[], yyyymmdd?: string): Promise<Match[]> {
    const board = await this.client.allScoreboard(yyyymmdd);
    if ((board.events?.length ?? 0) >= ALL_FEED_LIMIT) return this.scoreboards(leagues, yyyymmdd);
    return matchesFromAllFeed(board, leagues);
  }

  async getMatchesByDate(date: IsoDate, leagueIds?: LeagueId[]): Promise<Match[]> {
    if (!isIsoDate(date)) throw new DataSourceError("invalid_id", `Data inválida: ${date}`, { source: "espn" });
    const matches = await this.fromFeed(this.targetLeagues(leagueIds), compact(date));
    return matches.filter((m) => isOnDate(m.kickoff, date)).sort(byKickoff);
  }

  /**
   * Jogos em andamento na janela "atual" do feed (o dia dos EUA). Perto da virada desse dia
   * (~01h de Brasília) um jogo ainda em andamento pode sair da janela; o orquestrador não usa
   * este método para o ao vivo: ele deriva o ao vivo das listas de ontem e de hoje.
   */
  async getLiveMatches(leagueIds?: LeagueId[]): Promise<Match[]> {
    const matches = await this.fromFeed(this.targetLeagues(leagueIds));
    return matches.filter((m) => m.status === "live" || m.status === "halftime").sort(byKickoff);
  }

  async getMatch(id: string): Promise<MatchDetail> {
    const { source, parts } = parseId(id);
    if (source !== "espn" || parts.length !== 2) throw new DataSourceError("invalid_id", `Id de partida inválido para a ESPN: "${id}"`, { source: "espn" });
    const [slug, eventId] = parts;
    const league = findLeagueBySourceCode("espn", slug);
    if (!league) throw new DataSourceError("unsupported", `Liga da ESPN fora do catálogo: ${slug}`, { source: "espn" });

    const detail = toMatchDetail(await this.client.summary(slug, eventId), league.id, slug, eventId);
    if (!detail) throw new DataSourceError("bad_response", `Resumo da partida ${id} veio incompleto`, { source: "espn" });
    return detail;
  }

  async getStandings(leagueId: LeagueId): Promise<Standings> {
    const def = getLeagueDef(leagueId);
    const standings = standingsFromEspn(await this.client.standings(espnSlugOf(def)), def);
    if (!standings) throw new DataSourceError("not_found", `A ESPN não tem classificação para ${leagueId}`, { source: "espn" });
    return standings;
  }

  async getTeam(id: string, query: TeamQuery = {}): Promise<TeamDetail> {
    const { source, parts } = parseId(id);
    if (source !== "espn" || parts.length !== 1) throw new DataSourceError("invalid_id", `Id de time inválido para a ESPN: "${id}"`, { source: "espn" });
    const slug = query.leagueId ? espnSlugOf(getLeagueDef(query.leagueId)) : "all";

    const [played, fixtures] = await Promise.all([
      this.client.teamSchedule(slug, parts[0]),
      // Os jogos futuros só vêm com `fixture=true`; se falhar, a página ainda mostra o histórico.
      this.client.teamSchedule(slug, parts[0], { fixture: true }).catch(() => null),
    ]);
    const team = toTeam(played.team);
    if (!team) throw new DataSourceError("not_found", `Time ${id} não encontrado na ESPN`, { source: "espn" });

    const all = new Map<string, Match>();
    for (const m of [...matchesFromSchedule(played.events), ...matchesFromSchedule(fixtures?.events)]) all.set(m.id, m);
    const { recent, upcoming, leagueIds } = splitTeamMatches([...all.values()]);

    return { team, leagueIds, upcoming, recent, standing: await this.standingOf(team.id, query.leagueId ?? currentLeague(upcoming, recent)) };
  }

  /** Linha do time na tabela. Falha aqui não derruba a página do time. */
  private async standingOf(teamId: string, leagueId: LeagueId | null): Promise<TeamDetail["standing"]> {
    if (!leagueId) return null;
    try {
      const standings = await this.getStandings(leagueId);
      for (const g of standings.groups) {
        const row: StandingRow | undefined = g.rows.find((r) => r.team.id === teamId);
        if (row) return { leagueId, row };
      }
    } catch {
      /* tabela indisponível: segue sem posição */
    }
    return null;
  }
}
