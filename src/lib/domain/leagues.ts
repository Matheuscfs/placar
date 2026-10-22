import type { League, LeagueId, SourceId, Zone } from "./types";

/** Faixa de posições da tabela (inclusive) que recebe uma zona colorida. */
export interface ZoneRule extends Zone {
  from: number;
  to: number;
}

/** Como achar a liga em cada fonte. Ausente = a fonte não cobre. */
export interface LeagueSources {
  /** Slug da ESPN: `.../sports/soccer/<slug>/scoreboard`. */
  espn?: string;
  /**
   * Id numérico da liga na ESPN (o `l:630` de `uid: "s:600~l:630~e:…"`). É como se reconhece a
   * liga no feed `soccer/all/scoreboard`, que traz TODAS as ligas numa chamada só.
   */
  espnLeagueId?: string;
  /** Código da competição no football-data.org (v4). */
  "football-data"?: string;
  /**
   * Caminhos no openfootball. `{year}` = ano da temporada (`2026`); `{season}` = `2026-27`.
   * `json` fica em openfootball/football.json; `txt` em openfootball/south-america (formato Football.TXT).
   */
  openfootball?: { json?: string; txt?: string; /** Fuso dos horários do arquivo (são locais, não UTC). */ timezone: string };
}

export interface LeagueDef extends League {
  sources: LeagueSources;
  /**
   * Zonas da tabela usadas quando a fonte não informa (a ESPN informa só em algumas ligas).
   * ATENÇÃO: as vagas mudam de ano para ano — conferir o regulamento da temporada.
   */
  zones: ZoneRule[];
}

const BRT = "America/Sao_Paulo";

const rel = (from: number, to: number): ZoneRule => ({ key: "relegation", label: "Rebaixamento", tone: "relegation", from, to });

export const LEAGUES: readonly LeagueDef[] = [
  {
    id: "brasileirao-a",
    name: "Campeonato Brasileiro Série A",
    shortName: "Brasileirão A",
    country: "Brasil",
    kind: "league",
    order: 1,
    sources: {
      espn: "bra.1", espnLeagueId: "630",
      "football-data": "BSA",
      openfootball: { json: "{year}/br.1.json", txt: "brazil/{year}_br1.txt", timezone: BRT },
    },
    zones: [
      { key: "libertadores", label: "Libertadores (fase de grupos)", tone: "qualification", from: 1, to: 4 },
      { key: "libertadores-q", label: "Libertadores (pré)", tone: "qualification", from: 5, to: 6 },
      { key: "sul-americana", label: "Sul-Americana", tone: "playoff", from: 7, to: 12 },
      rel(17, 20),
    ],
  },
  {
    id: "brasileirao-b",
    name: "Campeonato Brasileiro Série B",
    shortName: "Brasileirão B",
    country: "Brasil",
    kind: "league",
    order: 2,
    sources: { espn: "bra.2", espnLeagueId: "4007", openfootball: { json: "{year}/br.2.json", txt: "brazil/{year}_br2.txt", timezone: BRT } },
    zones: [{ key: "acesso", label: "Acesso à Série A", tone: "title", from: 1, to: 4 }, rel(17, 20)],
  },
  {
    id: "copa-do-brasil",
    name: "Copa do Brasil",
    shortName: "Copa do Brasil",
    country: "Brasil",
    kind: "cup",
    order: 3,
    sources: { espn: "bra.copa_do_brazil", espnLeagueId: "8306", openfootball: { txt: "brazil/{year}_brcup.txt", timezone: BRT } },
    zones: [],
  },
  {
    id: "libertadores",
    name: "CONMEBOL Libertadores",
    shortName: "Libertadores",
    country: "América do Sul",
    kind: "cup",
    order: 4,
    sources: { espn: "conmebol.libertadores", espnLeagueId: "783", openfootball: { json: "{year}/copa.l.json", txt: "copa-libertadores/{year}_copal.txt", timezone: BRT } },
    zones: [],
  },
  {
    id: "sul-americana",
    name: "CONMEBOL Sul-Americana",
    shortName: "Sul-Americana",
    country: "América do Sul",
    kind: "cup",
    order: 5,
    sources: { espn: "conmebol.sudamericana", espnLeagueId: "5454", openfootball: { txt: "copa-libertadores/{year}_copas.txt", timezone: BRT } },
    zones: [],
  },
  {
    id: "premier-league",
    name: "Premier League",
    shortName: "Premier League",
    country: "Inglaterra",
    kind: "league",
    order: 10,
    sources: { espn: "eng.1", espnLeagueId: "700", "football-data": "PL", openfootball: { json: "{season}/en.1.json", timezone: "Europe/London" } },
    zones: [
      { key: "champions-league", label: "Champions League", tone: "qualification", from: 1, to: 4 },
      { key: "europa-league", label: "Europa League", tone: "playoff", from: 5, to: 5 },
      rel(18, 20),
    ],
  },
  {
    id: "la-liga",
    name: "La Liga",
    shortName: "La Liga",
    country: "Espanha",
    kind: "league",
    order: 11,
    sources: { espn: "esp.1", espnLeagueId: "740", "football-data": "PD", openfootball: { json: "{season}/es.1.json", timezone: "Europe/Madrid" } },
    zones: [
      { key: "champions-league", label: "Champions League", tone: "qualification", from: 1, to: 4 },
      { key: "europa-league", label: "Europa League", tone: "playoff", from: 5, to: 6 },
      rel(18, 20),
    ],
  },
  {
    id: "serie-a-italia",
    name: "Serie A (Itália)",
    shortName: "Serie A",
    country: "Itália",
    kind: "league",
    order: 12,
    sources: { espn: "ita.1", espnLeagueId: "730", "football-data": "SA", openfootball: { json: "{season}/it.1.json", timezone: "Europe/Rome" } },
    zones: [
      { key: "champions-league", label: "Champions League", tone: "qualification", from: 1, to: 4 },
      { key: "europa-league", label: "Europa League", tone: "playoff", from: 5, to: 6 },
      rel(18, 20),
    ],
  },
  {
    id: "bundesliga",
    name: "Bundesliga",
    shortName: "Bundesliga",
    country: "Alemanha",
    kind: "league",
    order: 13,
    sources: { espn: "ger.1", espnLeagueId: "720", "football-data": "BL1", openfootball: { json: "{season}/de.1.json", timezone: "Europe/Berlin" } },
    zones: [
      { key: "champions-league", label: "Champions League", tone: "qualification", from: 1, to: 4 },
      { key: "europa-league", label: "Europa League", tone: "playoff", from: 5, to: 5 },
      { key: "playoff-reb", label: "Repescagem", tone: "playoff", from: 16, to: 16 },
      rel(17, 18),
    ],
  },
  {
    id: "champions-league",
    name: "UEFA Champions League",
    shortName: "Champions",
    country: "Europa",
    kind: "cup",
    order: 14,
    sources: { espn: "uefa.champions", espnLeagueId: "775", "football-data": "CL" }, // o openfootball não tem a Champions League
    zones: [],
  },
  { id: "paulistao", name: "Campeonato Paulista", shortName: "Paulistão", country: "Brasil", kind: "league", order: 20, sources: { espn: "bra.camp.paulista", espnLeagueId: "8207" }, zones: [] },
  { id: "carioca", name: "Campeonato Carioca", shortName: "Carioca", country: "Brasil", kind: "league", order: 21, sources: { espn: "bra.camp.carioca", espnLeagueId: "2265" }, zones: [] },
  { id: "mineiro", name: "Campeonato Mineiro", shortName: "Mineiro", country: "Brasil", kind: "league", order: 22, sources: { espn: "bra.camp.mineiro", espnLeagueId: "10872" }, zones: [] },
  { id: "gaucho", name: "Campeonato Gaúcho", shortName: "Gaúcho", country: "Brasil", kind: "league", order: 23, sources: { espn: "bra.camp.gaucho", espnLeagueId: "2272" }, zones: [] },
];

const BY_ID = new Map<LeagueId, LeagueDef>(LEAGUES.map((l) => [l.id, l]));

export function getLeagueDef(id: LeagueId): LeagueDef {
  const def = BY_ID.get(id);
  if (!def) throw new RangeError(`Liga desconhecida: ${id}`);
  return def;
}

export function isLeagueId(value: string): value is LeagueId {
  return BY_ID.has(value as LeagueId);
}

/** Ligas que uma fonte cobre, na ordem de exibição. */
export function leaguesForSource(source: SourceId): LeagueDef[] {
  return LEAGUES.filter((l) => l.sources[source] !== undefined).sort((a, b) => a.order - b.order);
}

/** Liga correspondente a um código da fonte (ex.: ESPN `bra.1` → `brasileirao-a`). */
export function findLeagueBySourceCode(source: "espn" | "football-data", code: string): LeagueDef | undefined {
  return LEAGUES.find((l) => l.sources[source] === code);
}

/** Zona da posição `position` segundo o catálogo, ou `null`. */
export function zoneFor(league: LeagueDef, position: number): Zone | null {
  const rule = league.zones.find((z) => position >= z.from && position <= z.to);
  return rule ? { key: rule.key, label: rule.label, tone: rule.tone } : null;
}

/** Versão pública (sem detalhes de fonte) para a API. */
export function toPublicLeague(def: LeagueDef): League {
  return { id: def.id, name: def.name, shortName: def.shortName, country: def.country, kind: def.kind, order: def.order, logo: def.logo };
}
