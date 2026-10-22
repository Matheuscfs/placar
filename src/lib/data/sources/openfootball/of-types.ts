/**
 * Formato intermediário do openfootball. Os dois formatos de origem (JSON do
 * `football.json` e Football.TXT do `south-america`) são lidos para estes tipos e só então
 * convertidos para o modelo do Placar em `convert.ts`.
 */

export type Pair = [home: number, away: number];

/** `ft` = tempo regulamentar; `et` = após prorrogação; `p` = disputa de pênaltis; `ht` = 1º tempo. */
export interface OfScore {
  ft?: Pair;
  ht?: Pair;
  et?: Pair;
  p?: Pair;
}

export interface OfMatch {
  /** Rodada/fase como o arquivo escreve ("Matchday 3", "Group, Matchday 1", "Finals, Final"). */
  round: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM` no horário LOCAL do campeonato (ver `LeagueSources.openfootball.timezone`), ou `null`. */
  time: string | null;
  team1: string;
  team2: string;
  /** `null` = ainda sem resultado no arquivo. */
  score: OfScore | null;
  /** "A", "B"… em fases de grupos com cabeçalho `Group A`. */
  group: string | null;
}

export interface OfSeason {
  name: string;
  matches: OfMatch[];
}
