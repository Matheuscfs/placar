import type { IsoDate, IsoDateTime } from "@/lib/domain/types";

/**
 * E-sports vivem num módulo PRÓPRIO, separado do futebol: não há "mandante", tabela de pontos corridos,
 * escudos de liga fixos nem minuto de jogo. O que existe é partida entre dois times, em série (melhor de N
 * mapas), dentro de torneios que mudam o ano todo.
 *
 * Só CALENDÁRIO e RESULTADOS: o plano gratuito do PandaScore não tem ao vivo.
 */
export const ESPORTS_GAMES = ["cs2", "lol", "valorant"] as const;
export type EsportsGameId = (typeof ESPORTS_GAMES)[number];

export interface EsportsGameDef {
  id: EsportsGameId;
  name: string;
  /** Slug do jogo no PandaScore (`filter[videogame]`). O CS2 ainda usa o slug antigo `cs-go`. */
  pandaSlug: string;
}

export const ESPORTS_GAME_DEFS: readonly EsportsGameDef[] = [
  { id: "cs2", name: "Counter-Strike 2", pandaSlug: "cs-go" },
  { id: "lol", name: "League of Legends", pandaSlug: "league-of-legends" },
  { id: "valorant", name: "Valorant", pandaSlug: "valorant" },
];

export const isEsportsGameId = (v: string): v is EsportsGameId => (ESPORTS_GAMES as readonly string[]).includes(v);
export const esportsGameDef = (id: EsportsGameId): EsportsGameDef => ESPORTS_GAME_DEFS.find((g) => g.id === id)!;

export interface EsportsTeam {
  /** `pandascore:<id>` */
  id: string;
  name: string;
  /** Sigla (ex.: "FUR"), quando a fonte informa. */
  acronym: string | null;
  logo: string | null;
}

export type EsportsStatus = "scheduled" | "live" | "finished" | "postponed" | "canceled";

export interface EsportsSide {
  /** `null` = adversário ainda não definido (ex.: espera o vencedor de outra partida). */
  team: EsportsTeam | null;
  /** Mapas vencidos. `null` antes de começar. */
  score: number | null;
  winner: boolean;
}

export interface EsportsStream {
  /** Sempre `https`. */
  url: string;
  language: string | null;
  official: boolean;
  main: boolean;
}

export type EsportsTier = "S" | "A" | "B" | "C" | "D" | "unranked";

export interface EsportsMatch {
  /** `pandascore:<id>` */
  id: string;
  game: EsportsGameId;
  status: EsportsStatus;
  /** Horário previsto (UTC). Partida sem horário não entra na lista (não dá para pôr num dia). */
  scheduledAt: IsoDateTime;
  /** Melhor de N mapas (`best_of`); `null` em outros formatos. */
  bestOf: number | null;
  forfeit: boolean;
  /** Campeonato (ex.: "LCK"). */
  league: string;
  /** Etapa/edição (ex.: "Spring 2026"). */
  serie: string | null;
  /** Fase (ex.: "Playoffs"). */
  tournament: string | null;
  tier: EsportsTier;
  home: EsportsSide;
  away: EsportsSide;
  streams: EsportsStream[];
}

export interface EsportsMeta {
  source: "pandascore";
  fetchedAt: IsoDateTime;
  cache: "hit" | "miss" | "stale";
  ttlSeconds: number;
  /** A lista foi cortada no limite de páginas (dia com partidas demais): pode faltar jogo. */
  truncated: boolean;
}

export interface EsportsResult {
  data: EsportsMatch[];
  meta: EsportsMeta;
}

export type { IsoDate };
