/**
 * Formato (parcial) das respostas da API v4 do football-data.org, conforme
 * https://docs.football-data.org/general/v4/ (match, overtime, lookup_tables).
 *
 * ATENÇÃO: estes tipos e as fixtures dos testes vêm da DOCUMENTAÇÃO, não de respostas reais —
 * os endpoints por competição exigem token e nenhum foi usado ainda. Todos os campos são
 * opcionais e os conversores validam o que leem. Rodar o teste de integração com
 * FOOTBALL_DATA_TOKEN (ver `football-data-source.live.test.ts`) é o que confirma o formato.
 */

/** Placar de um lado. O exemplo da doc de prorrogação usa `homeTeam/awayTeam`; a v4 usa `home/away`. */
export interface FdGoals {
  home?: number | null;
  away?: number | null;
  homeTeam?: number | null;
  awayTeam?: number | null;
}

export interface FdScore {
  winner?: string | null;
  /** `REGULAR` | `EXTRA_TIME` | `PENALTY_SHOOTOUT`. */
  duration?: string;
  /** Placar final: INCLUI prorrogação e pênaltis (ver doc "Dealing with overtime and penalty shootout"). */
  fullTime?: FdGoals;
  halfTime?: FdGoals;
  regularTime?: FdGoals;
  extraTime?: FdGoals;
  /** Só os gols da disputa de pênaltis. */
  penalties?: FdGoals;
}

export interface FdPlayer {
  id?: number;
  name?: string;
  position?: string | null;
  shirtNumber?: number | null;
}

export interface FdTeamRef {
  id?: number;
  name?: string;
  shortName?: string;
  tla?: string;
  crest?: string;
  coach?: { name?: string };
  formation?: string;
  lineup?: FdPlayer[];
  bench?: FdPlayer[];
  /** Chaves em snake_case: `ball_possession`, `shots_on_goal`, `corner_kicks`… */
  statistics?: Record<string, number | string | null>;
}

export interface FdIdName {
  id?: number;
  name?: string;
}

export interface FdMatch {
  id?: number;
  utcDate?: string;
  /** SCHEDULED, TIMED, IN_PLAY, PAUSED, EXTRA_TIME, PENALTY_SHOOTOUT, FINISHED, SUSPENDED, POSTPONED, CANCELLED, AWARDED. */
  status?: string;
  minute?: number | null;
  injuryTime?: number | null;
  attendance?: number | null;
  venue?: string | null;
  matchday?: number | null;
  /** REGULAR_SEASON, GROUP_STAGE, LAST_16, QUARTER_FINALS, SEMI_FINALS, FINAL… */
  stage?: string;
  group?: string | null;
  competition?: { code?: string; name?: string };
  season?: { startDate?: string };
  homeTeam?: FdTeamRef;
  awayTeam?: FdTeamRef;
  score?: FdScore;
  referees?: Array<{ name?: string; type?: string }>;
  goals?: Array<{
    minute?: number | null;
    injuryTime?: number | null;
    /** `REGULAR`, `PENALTY`, `OWN`. */
    type?: string;
    team?: FdIdName;
    scorer?: FdIdName | null;
    assist?: FdIdName | null;
    /** Placar após o gol. */
    score?: FdGoals;
  }>;
  bookings?: Array<{ minute?: number | null; injuryTime?: number | null; team?: FdIdName; player?: FdIdName; card?: string }>;
  substitutions?: Array<{ minute?: number | null; injuryTime?: number | null; team?: FdIdName; playerOut?: FdIdName; playerIn?: FdIdName }>;
}

export interface FdMatchList {
  matches?: FdMatch[];
}

export interface FdStandingRow {
  position?: number;
  team?: FdTeamRef;
  playedGames?: number;
  won?: number;
  draw?: number;
  lost?: number;
  points?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
  form?: string | null;
}

export interface FdStandings {
  season?: { startDate?: string };
  standings?: Array<{
    stage?: string;
    /** `TOTAL`, `HOME`, `AWAY`. */
    type?: string;
    group?: string | null;
    table?: FdStandingRow[];
  }>;
}
