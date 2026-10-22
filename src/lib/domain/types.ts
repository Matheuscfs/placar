/**
 * Modelo de dados PRÓPRIO e normalizado do Placar.
 *
 * Toda fonte externa (ESPN, openfootball, football-data.org…) é convertida para
 * estes tipos dentro do seu conector. O front-end e a API só conhecem este modelo.
 */

// ───────────────────────── Identificadores ─────────────────────────

export const SOURCE_IDS = ["espn", "openfootball", "football-data"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** Slug interno e estável de uma liga (não depende de nenhuma fonte). */
export const LEAGUE_IDS = [
  "brasileirao-a",
  "brasileirao-b",
  "copa-do-brasil",
  "libertadores",
  "sul-americana",
  "premier-league",
  "la-liga",
  "serie-a-italia",
  "bundesliga",
  "champions-league",
  "paulistao",
  "carioca",
  "mineiro",
  "gaucho",
  "recopa",
  "copa-do-nordeste",
  "amistosos",
  "liga-das-nacoes",
  "europa-league",
  "conference-league",
  "ligue-1",
  "liga-portugal",
  "eredivisie",
  "liga-argentina",
  "mls",
  "liga-mx",
  "fa-cup",
  "copa-da-liga-inglesa",
  "copa-del-rey",
  "coppa-italia",
  "copa-da-alemanha",
] as const;
export type LeagueId = (typeof LEAGUE_IDS)[number];

/** Data de calendário no formato `YYYY-MM-DD`, no fuso do app (America/Sao_Paulo). */
export type IsoDate = string;
/** Instante em UTC no formato ISO 8601 (`2026-10-23T00:30:00Z`). */
export type IsoDateTime = string;

// ───────────────────────── Ligas ─────────────────────────

export type LeagueKind = "league" | "cup";

export interface League {
  id: LeagueId;
  name: string;
  shortName: string;
  /** Nome do país em português, ou "América do Sul" / "Europa" para torneios continentais. */
  country: string;
  kind: LeagueKind;
  /** Ordem de exibição na tela inicial (menor = primeiro). */
  order: number;
  logo?: string;
}

// ───────────────────────── Times ─────────────────────────

export interface Team {
  /** Id qualificado pela fonte: `espn:<id>`. Ver `ids.ts`. */
  id: string;
  /**
   * Chave estável entre fontes (ex.: "palmeiras"), gerada por `normalizeTeamKey`.
   * É ela que identifica o time nos favoritos, para que trocar de fonte não quebre nada.
   */
  key: string;
  name: string;
  shortName: string;
  /** Sigla de 3–4 letras. */
  abbr: string;
  logo?: string;
  /** Cor principal em hex, sem `#` (como a fonte entrega). */
  color?: string;
}

// ───────────────────────── Partidas ─────────────────────────

export type MatchStatus =
  | "scheduled" // ainda não começou
  | "live" // em andamento (inclui prorrogação e pênaltis)
  | "halftime" // intervalo
  | "finished"
  | "postponed" // adiado
  | "suspended"
  | "canceled";

export interface MatchSide {
  team: Team;
  /** `null` enquanto o jogo não começou. */
  score: number | null;
  /** Placar da disputa de pênaltis, se houve. */
  penalties: number | null;
  /** Placar agregado em mata-mata de ida e volta, se a fonte informar. */
  aggregate: number | null;
}

export interface Match {
  /** Id qualificado pela fonte: `espn:<liga>:<evento>`. */
  id: string;
  source: SourceId;
  leagueId: LeagueId;
  /** Temporada como a fonte descreve (`2026`, `2026-27`). */
  season: string | null;
  /** Rodada / fase em texto livre ("Rodada 31", "Semifinal"). */
  round: string | null;
  kickoff: IsoDateTime;
  status: MatchStatus;
  /** Texto curto de status da fonte, já em português quando possível ("2º tempo", "Pênaltis"). */
  statusText: string | null;
  /** Minuto de jogo para exibição ("67'", "45'+2'"); `null` fora de jogo. */
  clock: string | null;
  home: MatchSide;
  away: MatchSide;
  venue: string | null;
}

export type MatchEventType =
  | "kickoff"
  | "goal"
  | "penalty_goal"
  | "own_goal"
  | "missed_penalty"
  | "yellow_card"
  | "second_yellow"
  | "red_card"
  | "substitution"
  | "var"
  | "halftime"
  | "fulltime"
  | "other";

export interface MatchEvent {
  id: string;
  type: MatchEventType;
  /** Minuto base (45 para 45'+2'), para ordenação; `null` se desconhecido. */
  minute: number | null;
  /** Como mostrar na tela ("45'+2'"). */
  clock: string | null;
  /** Lado ao qual o evento pertence; `null` para eventos neutros (apito inicial). */
  side: "home" | "away" | null;
  player: string | null;
  /** Assistência, ou jogador que entra em uma substituição. */
  secondaryPlayer: string | null;
  /** Descrição livre da fonte. */
  text: string | null;
  /** Placar após o evento, quando for gol. */
  score: { home: number; away: number } | null;
}

export interface LineupPlayer {
  name: string;
  shirtNumber: number | null;
  /** Posição abreviada da fonte ("G", "ZAG", "MC"…). */
  position: string | null;
  captain: boolean;
}

export interface Lineup {
  side: "home" | "away";
  formation: string | null;
  coach: string | null;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
}

export interface StatLine {
  /** Chave estável ("possession", "shots", "shotsOnTarget"…). */
  key: string;
  label: string;
  home: number | null;
  away: number | null;
  /** Valor como a fonte exibe, quando a formatação importa ("62%"). */
  homeText: string | null;
  awayText: string | null;
}

/** Partida com tudo o que a página do jogo mostra. Campos ausentes na fonte vêm vazios. */
export interface MatchDetail extends Match {
  referee: string | null;
  attendance: number | null;
  events: MatchEvent[];
  lineups: Lineup[];
  statistics: StatLine[];
}

// ───────────────────────── Classificação ─────────────────────────

/** `promotion` = acesso; `qualification` = vaga continental; `playoff` = repescagem; `relegation` = rebaixamento. */
export type ZoneTone = "title" | "qualification" | "playoff" | "relegation";

export interface Zone {
  key: string;
  label: string;
  tone: ZoneTone;
}

export interface StandingRow {
  position: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Últimos resultados, do mais antigo ao mais recente: "VVEDV". */
  form: string | null;
  zone: Zone | null;
}

export interface StandingsGroup {
  /** Nome do grupo ("Grupo A") ou `null` em pontos corridos. */
  name: string | null;
  rows: StandingRow[];
}

export interface Standings {
  leagueId: LeagueId;
  season: string | null;
  groups: StandingsGroup[];
}

// ───────────────────────── Time (página) ─────────────────────────

export interface TeamDetail {
  team: Team;
  /** Ligas em que o time aparece na classificação/jogos retornados. */
  leagueIds: LeagueId[];
  upcoming: Match[];
  recent: Match[];
  /** Linha do time na classificação principal, se encontrada. */
  standing: { leagueId: LeagueId; row: StandingRow } | null;
}

// ───────────────────────── Proveniência ─────────────────────────

export type CacheState = "hit" | "miss" | "stale";

export interface SourceFailure {
  source: SourceId;
  /** `DataSourceErrorKind` ("unavailable", "timeout", "rate_limited"…). */
  kind: string;
  message: string;
  /** Liga em que a falha ocorreu, quando a consulta era por liga. */
  leagueId?: LeagueId;
}

export interface ResponseMeta {
  /** Fonte que mais contribuiu com esta resposta. */
  source: SourceId;
  /**
   * Todas as fontes que contribuíram. Uma lista de jogos pode misturar fontes (uma por liga);
   * cada `Match` também traz a sua em `Match.source`.
   */
  sources: SourceId[];
  /** Quando o dado MAIS ANTIGO desta resposta foi buscado na fonte. */
  fetchedAt: IsoDateTime;
  /** Pior caso entre as partes: `stale` > `miss` > `hit`. `stale` = fonte falhou e servimos o último dado bom. */
  cache: CacheState;
  /** Por quanto tempo o cliente pode tratar esta resposta como fresca (base do polling e do Cache-Control). */
  ttlSeconds: number;
  /** `true` se alguma parte veio de uma fonte reserva (dados podem ser mais pobres ou atrasados). */
  fallback: boolean;
  /** Ligas pedidas para as quais NENHUMA fonte devolveu dados (a UI deve avisar). */
  missing: LeagueId[];
  /** O que falhou pelo caminho, para diagnóstico. */
  failures: SourceFailure[];
}

/** Tudo o que a API devolve vem embrulhado assim, para o front saber de onde veio cada dado. */
export interface Sourced<T> {
  data: T;
  meta: ResponseMeta;
}
