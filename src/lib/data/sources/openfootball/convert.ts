/**
 * Conversores openfootball → modelo do Placar. Funções puras, cobertas por testes com
 * arquivos reais gravados em `__fixtures__/`.
 *
 * O openfootball NÃO é ao vivo e não tem escudos, escalações, estatísticas nem eventos:
 * só calendário e resultado final. A classificação é CALCULADA a partir dos resultados.
 */
import { zonedTimeToUtc } from "@/lib/domain/dates";
import { makeId } from "@/lib/domain/ids";
import { zoneFor, type LeagueDef } from "@/lib/domain/leagues";
import { deriveAbbr, normalizeTeamKey, teamDisplayName } from "@/lib/domain/team-key";
import type { IsoDate, Match, MatchSide, StandingRow, Standings, Team } from "@/lib/domain/types";
import type { OfMatch, OfScore, Pair } from "./of-types";

// ───────────────────────── Temporada e caminhos ─────────────────────────

/**
 * Rótulo da temporada que contém `date`: "2026" (ano-calendário, Brasil) ou "2026-27"
 * (europeias, que começam em julho/agosto). Decide pelo molde do caminho do arquivo.
 */
export function seasonLabelFor(league: LeagueDef, date: IsoDate): string {
  const of = league.sources.openfootball;
  const european = (of?.json ?? of?.txt ?? "").includes("{season}");
  const [y, m] = date.split("-").map(Number);
  if (!european) return String(y);
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function fillPath(template: string, label: string): string {
  return template.replaceAll("{season}", label).replaceAll("{year}", label);
}

export const seasonStartYear = (label: string) => Number(label.slice(0, 4));

// ───────────────────────── Rodada ─────────────────────────

const ordinal = (n: string) => `${n}ª fase`;

/** "Group, Matchday 2" → "Fase de grupos · Rodada 2". Desconhecido: devolve o texto original. */
export function roundLabelOf(raw: string): string | null {
  const r = raw.trim();
  if (!r) return null;
  let m: RegExpExecArray | null;
  if ((m = /^Matchday (\d+)$/i.exec(r))) return `Rodada ${m[1]}`;
  if ((m = /^Group, Matchday (\d+)$/i.exec(r))) return `Fase de grupos · Rodada ${m[1]}`;
  if ((m = /^Group ([A-Z])$/.exec(r))) return `Grupo ${m[1]}`;
  if ((m = /^Qualifying, Round (\d+)$/i.exec(r))) return ordinal(m[1]);
  if ((m = /^Playoffs, Matchday ([12])$/i.exec(r))) return `Oitavas de final · ${m[1] === "1" ? "Ida" : "Volta"}`;
  if ((m = /^Round (\d+)$/i.exec(r))) return ordinal(m[1]);
  if (/^(Finals, )?Round of 16$/i.test(r)) return "Oitavas de final";
  if (/^(Finals, )?Quarterfinals$/i.test(r)) return "Quartas de final";
  if (/^(Finals, )?Semifinals$/i.test(r)) return "Semifinal";
  if (/^(Finals, )?Final$/i.test(r)) return "Final";
  if (/^Preliminary round$/i.test(r)) return "Fase preliminar";
  return r;
}

// ───────────────────────── Time e partida ─────────────────────────

export { deriveAbbr };

export function toTeam(rawName: string): Team {
  const key = normalizeTeamKey(rawName);
  const name = teamDisplayName(rawName);
  // Sem escudo e sem cor: o openfootball não fornece.
  return { id: makeId("openfootball", key), key, name, shortName: name, abbr: deriveAbbr(name) };
}

/**
 * Placar do jogo (inclui prorrogação, exclui pênaltis) e placar dos pênaltis. Os arquivos às
 * vezes repetem o placar dos pênaltis como se fosse o da prorrogação ("1-4 pen. 1-4 a.e.t.");
 * nesse caso vale o tempo regulamentar.
 */
export function gameScore(s: OfScore | null): { game: Pair; penalties: Pair | null } | null {
  if (!s) return null;
  const same = (a?: Pair, b?: Pair) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
  const game = s.p ? (s.et && !same(s.et, s.p) ? s.et : (s.ft ?? s.et)) : (s.et ?? s.ft);
  return game ? { game, penalties: s.p ?? null } : null;
}

export interface LeagueContext {
  league: LeagueDef;
  /** Rótulo da temporada ("2026", "2026-27"). */
  season: string;
  /** Fuso dos horários do arquivo. */
  timeZone: string;
}

/**
 * Jogo sem horário usa 12:00 local: o dia fica certo, a hora é só um placeholder.
 * Jogo com resultado é "encerrado"; sem resultado é "agendado" (o arquivo não sabe de adiamentos).
 */
export function toMatch(m: OfMatch, ctx: LeagueContext): Match | null {
  const home = toTeam(m.team1);
  const away = toTeam(m.team2);
  if (!home.key || !away.key || home.key === away.key) return null;

  let kickoff: string;
  try {
    kickoff = zonedTimeToUtc(m.date, m.time ?? "12:00", ctx.timeZone);
  } catch {
    return null;
  }

  const result = gameScore(m.score);
  const side = (team: Team, i: 0 | 1): MatchSide => ({
    team,
    score: result ? result.game[i] : null,
    penalties: result?.penalties ? result.penalties[i] : null,
    aggregate: null, // o arquivo não informa o agregado
  });

  return {
    id: makeId("openfootball", ctx.league.id, ctx.season, `${m.date}.${home.key}.${away.key}`),
    source: "openfootball",
    leagueId: ctx.league.id,
    season: ctx.season,
    round: roundLabelOf(m.round),
    kickoff,
    status: result ? "finished" : "scheduled",
    statusText: result ? (result.penalties ? "Encerrado (pênaltis)" : m.score?.et ? "Encerrado (prorrogação)" : "Encerrado") : null,
    clock: null,
    home: side(home, 0),
    away: side(away, 1),
    venue: null,
  };
}

export function matchesFromSeason(matches: OfMatch[], ctx: LeagueContext): Match[] {
  return matches.flatMap((m) => {
    const x = toMatch(m, ctx);
    return x ? [x] : [];
  });
}

// ───────────────────────── Classificação calculada ─────────────────────────

interface Acc {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  results: string[];
}

/**
 * Tabela de pontos corridos a partir dos resultados (3 pontos por vitória). Critérios:
 * pontos → vitórias (só campeonatos brasileiros) → saldo → gols pró → nome. NÃO considera
 * confronto direto, fair play nem punições — por isso é uma tabela aproximada, e só
 * serve como base/reserva.
 */
export function standingsFromMatches(matches: Match[], league: LeagueDef, season: string): Standings {
  const table = new Map<string, Acc>();
  const acc = (team: Team) => {
    let a = table.get(team.id);
    if (!a) table.set(team.id, (a = { team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, results: [] }));
    return a;
  };

  const chronological = [...matches].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  for (const m of chronological) {
    const h = acc(m.home.team);
    const a = acc(m.away.team); // todos os times entram, mesmo sem jogo disputado
    if (m.status !== "finished" || m.home.score === null || m.away.score === null) continue;
    const [hg, ag] = [m.home.score, m.away.score];
    h.played++;
    a.played++;
    h.gf += hg;
    h.ga += ag;
    a.gf += ag;
    a.ga += hg;
    if (hg > ag) {
      h.won++;
      a.lost++;
      h.results.push("V");
      a.results.push("D");
    } else if (hg < ag) {
      a.won++;
      h.lost++;
      a.results.push("V");
      h.results.push("D");
    } else {
      h.drawn++;
      a.drawn++;
      h.results.push("E");
      a.results.push("E");
    }
  }

  const brazilian = league.country === "Brasil";
  const pts = (x: Acc) => x.won * 3 + x.drawn;
  const sorted = [...table.values()].sort(
    (x, y) =>
      pts(y) - pts(x) ||
      (brazilian ? y.won - x.won : 0) ||
      y.gf - y.ga - (x.gf - x.ga) ||
      y.gf - x.gf ||
      x.team.name.localeCompare(y.team.name, "pt-BR"),
  );

  const rows: StandingRow[] = sorted.map((x, i) => ({
    position: i + 1,
    team: x.team,
    played: x.played,
    won: x.won,
    drawn: x.drawn,
    lost: x.lost,
    goalsFor: x.gf,
    goalsAgainst: x.ga,
    goalDifference: x.gf - x.ga,
    points: pts(x),
    form: x.results.length ? x.results.slice(-5).join("") : null, // do mais antigo ao mais recente
    zone: zoneFor(league, i + 1),
  }));
  return { leagueId: league.id, season, groups: [{ name: null, rows }] };
}
