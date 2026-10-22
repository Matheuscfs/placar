import type { IsoDate, League, LeagueId, Match, MatchDetail, SourceId, Standings, TeamDetail } from "@/lib/domain/types";

/**
 * O que cada fonte sabe fazer. O orquestrador usa isto para escolher a fonte
 * certa (ex.: só pede eventos a quem declara `events: true`).
 */
export interface SourceCapabilities {
  /** Placar e minuto atualizados durante o jogo, em tempo real. */
  live: boolean;
  /**
   * Tem jogos em andamento, mas com atraso (ex.: plano grátis do football-data). Não serve como
   * fonte principal do "ao vivo", só de reserva — a resposta vem marcada como `fallback`.
   */
  delayedLive?: boolean;
  /** Gols, cartões e substituições. */
  events: boolean;
  lineups: boolean;
  statistics: boolean;
  standings: boolean;
  /** Entrega URLs de escudos. */
  crests: boolean;
}

export interface TeamQuery {
  /** Ajuda fontes que precisam saber a liga para achar o time. */
  leagueId?: LeagueId;
}

/**
 * Contrato único de uma fonte de dados.
 *
 * Regras para quem implementa:
 * - Devolva SEMPRE o modelo normalizado de `domain/types.ts`; nada do formato da fonte vaza.
 * - Lance `DataSourceError` (com `kind`) em vez de erros genéricos — o orquestrador decide o fallback por ele.
 * - Lance `kind: "unsupported"` para ligas/recursos que a fonte não cobre.
 * - NÃO faça cache aqui: o cache e o controle de limite de requisições ficam no orquestrador.
 * - `date` é sempre a data de calendário no fuso do app (America/Sao_Paulo), não UTC.
 */
export interface DataSource {
  readonly id: SourceId;
  readonly capabilities: SourceCapabilities;

  /** A fonte cobre esta liga? Consulta local, sem rede. */
  supportsLeague(leagueId: LeagueId): boolean;

  getLeagues(): Promise<League[]>;

  /** Jogos do dia (no fuso do app). Sem `leagueIds`, todas as ligas que a fonte cobre. */
  getMatchesByDate(date: IsoDate, leagueIds?: LeagueId[]): Promise<Match[]>;

  /** Jogos em andamento agora (inclui intervalo). */
  getLiveMatches(leagueIds?: LeagueId[]): Promise<Match[]>;

  /** `id` é o id qualificado devolvido em `Match.id`. Eventos/escalações/estatísticas vêm quando a fonte tiver. */
  getMatch(id: string): Promise<MatchDetail>;

  getStandings(leagueId: LeagueId): Promise<Standings>;

  /** `id` é o `Team.id` qualificado. */
  getTeam(id: string, query?: TeamQuery): Promise<TeamDetail>;
}
