/**
 * Formato (parcial) das respostas da API pública da ESPN.
 *
 * A API não é documentada nem garantida, então TODOS os campos são opcionais: os
 * conversores em `convert.ts` validam o que usam e descartam o que vier malformado.
 * Só aparecem aqui os campos que o Placar de fato lê.
 */

export interface EspnLogo {
  href?: string;
  rel?: string[];
}

export interface EspnTeam {
  id?: string;
  displayName?: string;
  shortDisplayName?: string;
  name?: string;
  location?: string;
  abbreviation?: string;
  color?: string;
  logo?: string;
  logos?: EspnLogo[];
}

export interface EspnStatusType {
  name?: string;
  state?: "pre" | "in" | "post" | string;
  detail?: string;
  shortDetail?: string;
  description?: string;
}

export interface EspnStatus {
  clock?: number;
  displayClock?: string;
  period?: number;
  type?: EspnStatusType;
}

/** O placar vem como texto no scoreboard e como objeto na agenda do time. */
export type EspnScore = string | number | { value?: number; displayValue?: string } | null;

export interface EspnCompetitor {
  id?: string;
  homeAway?: "home" | "away" | string;
  score?: EspnScore;
  shootoutScore?: number;
  aggregateScore?: number;
  winner?: boolean;
  form?: string;
  team?: EspnTeam;
}

export interface EspnDetail {
  type?: { id?: string; text?: string };
  clock?: { value?: number; displayValue?: string };
  team?: { id?: string };
  scoringPlay?: boolean;
  yellowCard?: boolean;
  redCard?: boolean;
  penaltyKick?: boolean;
  ownGoal?: boolean;
  shootout?: boolean;
  athletesInvolved?: Array<{ displayName?: string; shortName?: string; fullName?: string }>;
}

export interface EspnCompetition {
  id?: string;
  date?: string;
  status?: EspnStatus;
  venue?: { fullName?: string; displayName?: string };
  competitors?: EspnCompetitor[];
  details?: EspnDetail[];
  notes?: Array<{ text?: string; headline?: string }>;
  series?: { totalCompetitions?: number };
  leg?: { value?: number; displayValue?: string };
  altGameNote?: string;
  attendance?: number;
}

export interface EspnEvent {
  id?: string;
  /** `s:600~l:630~e:401841272` — o `l:` é o id numérico da liga. */
  uid?: string;
  date?: string;
  name?: string;
  shortName?: string;
  season?: { year?: number; slug?: string };
  status?: EspnStatus;
  venue?: { fullName?: string; displayName?: string } | string;
  competitions?: EspnCompetition[];
  league?: { slug?: string };
}

export interface EspnScoreboard {
  leagues?: Array<{ slug?: string; season?: { year?: number } }>;
  events?: EspnEvent[];
}

// ───────────── summary (detalhe da partida) ─────────────

export interface EspnKeyEvent {
  id?: string;
  type?: { id?: string; text?: string; type?: string };
  text?: string;
  period?: { number?: number };
  clock?: { value?: number; displayValue?: string };
  scoringPlay?: boolean;
  shootout?: boolean;
  team?: { id?: string };
  participants?: Array<{ athlete?: { displayName?: string; shortName?: string } }>;
}

export interface EspnRosterPlayer {
  starter?: boolean;
  jersey?: string;
  athlete?: { id?: string; displayName?: string; fullName?: string; shortName?: string };
  position?: { abbreviation?: string };
  formationPlace?: string;
}

export interface EspnRoster {
  homeAway?: string;
  formation?: string;
  team?: EspnTeam;
  roster?: EspnRosterPlayer[];
}

export interface EspnBoxscoreStat {
  name?: string;
  label?: string;
  value?: number;
  displayValue?: string;
}

export interface EspnBoxscoreTeam {
  homeAway?: string;
  statistics?: EspnBoxscoreStat[];
}

export interface EspnSummary {
  header?: {
    id?: string;
    season?: { year?: number; name?: string };
    league?: { slug?: string };
    competitions?: EspnCompetition[];
  };
  keyEvents?: EspnKeyEvent[];
  rosters?: EspnRoster[];
  boxscore?: { teams?: EspnBoxscoreTeam[] };
  gameInfo?: {
    venue?: { fullName?: string };
    attendance?: number;
    officials?: Array<{ fullName?: string; displayName?: string; position?: { displayName?: string; name?: string } }>;
  };
}

// ───────────── classificação ─────────────

export interface EspnStandingStat {
  name?: string;
  value?: number;
  displayValue?: string;
}

export interface EspnStandingEntry {
  team?: EspnTeam;
  note?: { description?: string; rank?: number } | null;
  stats?: EspnStandingStat[];
}

export interface EspnStandings {
  season?: { year?: number };
  children?: Array<{
    name?: string;
    standings?: { entries?: EspnStandingEntry[] };
  }>;
}

// ───────────── agenda do time ─────────────

export interface EspnTeamSchedule {
  team?: EspnTeam;
  events?: EspnEvent[];
}
