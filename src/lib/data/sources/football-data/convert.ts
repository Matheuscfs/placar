/**
 * Conversores football-data.org → modelo do Placar. Funções puras.
 *
 * As fixtures dos testes foram escritas a partir da DOCUMENTAÇÃO (sem token não há como
 * capturar respostas reais). Onde a doc não deixa claro, o conversor é conservador e diz
 * isso no comentário.
 */
import { toIsoUtc } from "@/lib/domain/dates";
import { makeId } from "@/lib/domain/ids";
import { findLeagueBySourceCode, zoneFor, type LeagueDef } from "@/lib/domain/leagues";
import { deriveAbbr, normalizeTeamKey, teamDisplayName } from "@/lib/domain/team-key";
import type {
  Lineup,
  LineupPlayer,
  Match,
  MatchDetail,
  MatchEvent,
  MatchStatus,
  StandingRow,
  Standings,
  StatLine,
  Team,
} from "@/lib/domain/types";
import type { FdGoals, FdMatch, FdPlayer, FdStandings, FdTeamRef } from "./fd-types";

// ───────────────────────── Básicos ─────────────────────────

/** Lê `{ home, away }` ou `{ homeTeam, awayTeam }`; só devolve se os dois lados são números. */
export function goalsPair(g: FdGoals | null | undefined): [number, number] | null {
  const h = g?.home ?? g?.homeTeam;
  const a = g?.away ?? g?.awayTeam;
  return typeof h === "number" && typeof a === "number" ? [h, a] : null;
}

/**
 * Nome completo (`name`) para a chave e para exibir ("Manchester City FC" → "Manchester City");
 * o `shortName` do football-data é abreviado demais ("Man City") para casar com as outras fontes.
 */
export function toTeam(t: FdTeamRef | undefined): Team | null {
  if (typeof t?.id !== "number") return null;
  const raw = t.name ?? t.shortName;
  if (!raw) return null;
  const name = teamDisplayName(raw);
  const team: Team = { id: makeId("football-data", t.id), key: normalizeTeamKey(raw), name, shortName: name, abbr: t.tla ?? deriveAbbr(name) };
  if (t.crest) team.logo = t.crest;
  return team;
}

// ───────────────────────── Status ─────────────────────────

export interface ParsedStatus {
  status: MatchStatus;
  statusText: string | null;
  clock: string | null;
  shootout: boolean;
}

/** "67'" ou "90'+7'" (mesmo formato da ESPN). */
export function clockText(minute: number | null | undefined, injuryTime: number | null | undefined): string | null {
  if (typeof minute !== "number") return null;
  return injuryTime && injuryTime > 0 ? `${minute}'+${injuryTime}'` : `${minute}'`;
}

/**
 * A doc não diz se `minute` vem preenchido nas LISTAS de partidas (só no exemplo de detalhe).
 * Sem minuto, o jogo ao vivo continua "ao vivo", só sem relógio. Não há período no payload,
 * então o texto é genérico ("Ao vivo") em vez de chutar "1º/2º tempo".
 */
export function toStatus(m: Pick<FdMatch, "status" | "minute" | "injuryTime" | "score">): ParsedStatus {
  const duration = m.score?.duration;
  const shootout = duration === "PENALTY_SHOOTOUT" || m.status === "PENALTY_SHOOTOUT";
  const out = (status: MatchStatus, statusText: string | null, clock: string | null = null): ParsedStatus => ({ status, statusText, clock, shootout });

  switch (m.status) {
    case "IN_PLAY":
      return out("live", "Ao vivo", clockText(m.minute, m.injuryTime));
    case "EXTRA_TIME":
      return out("live", "Prorrogação", clockText(m.minute, m.injuryTime));
    case "PENALTY_SHOOTOUT":
      return out("live", "Pênaltis");
    case "PAUSED":
      return out("halftime", "Intervalo");
    case "FINISHED":
      return out("finished", duration === "PENALTY_SHOOTOUT" ? "Encerrado (pênaltis)" : duration === "EXTRA_TIME" ? "Encerrado (prorrogação)" : "Encerrado");
    case "AWARDED":
      return out("finished", "Encerrado (W.O.)");
    case "POSTPONED":
      return out("postponed", "Adiado");
    case "SUSPENDED":
      return out("suspended", "Interrompido");
    case "CANCELLED":
      return out("canceled", "Cancelado");
    default:
      return out("scheduled", null); // SCHEDULED, TIMED e valores desconhecidos
  }
}

// ───────────────────────── Fase ─────────────────────────

const STAGE_LABELS: Record<string, string> = {
  GROUP_STAGE: "Fase de grupos",
  LEAGUE_STAGE: "Fase de liga",
  PLAYOFFS: "Playoffs",
  LAST_64: "Fase de 64",
  LAST_32: "16 avos de final",
  LAST_16: "Oitavas de final",
  QUARTER_FINALS: "Quartas de final",
  SEMI_FINALS: "Semifinal",
  THIRD_PLACE: "Disputa do 3º lugar",
  FINAL: "Final",
  PRELIMINARY_ROUND: "Fase preliminar",
  QUALIFICATION: "Qualificação",
  ROUND_1: "1ª fase",
  ROUND_2: "2ª fase",
  ROUND_3: "3ª fase",
  ROUND_4: "4ª fase",
};

export function roundLabel(m: Pick<FdMatch, "stage" | "matchday" | "group">): string | null {
  const stage = m.stage ?? "";
  if (stage === "REGULAR_SEASON") return typeof m.matchday === "number" ? `Rodada ${m.matchday}` : null;
  const base = STAGE_LABELS[stage];
  if (!base) return null;
  return stage === "GROUP_STAGE" && typeof m.matchday === "number" ? `${base} · Rodada ${m.matchday}` : base;
}

// ───────────────────────── Partida ─────────────────────────

/**
 * Placar do jogo (inclui prorrogação, exclui pênaltis) e pênaltis. Como `fullTime` inclui os
 * pênaltis, o placar do jogo é `fullTime − penalties` (conferido no exemplo da doc: 7-6 final,
 * 1-1 no tempo normal, 6-5 nos pênaltis).
 */
export function matchScores(score: FdMatch["score"], played: boolean): { home: number | null; away: number | null; penHome: number | null; penAway: number | null } {
  const none = { home: null, away: null, penHome: null, penAway: null };
  if (!played) return none;
  const full = goalsPair(score?.fullTime);
  if (!full) return none;
  const pens = score?.duration === "PENALTY_SHOOTOUT" ? goalsPair(score.penalties) : null;
  if (!pens) return { home: full[0], away: full[1], penHome: null, penAway: null };
  return { home: Math.max(0, full[0] - pens[0]), away: Math.max(0, full[1] - pens[1]), penHome: pens[0], penAway: pens[1] };
}

export function toMatch(m: FdMatch): Match | null {
  const league = m.competition?.code ? findLeagueBySourceCode("football-data", m.competition.code) : undefined;
  const home = toTeam(m.homeTeam);
  const away = toTeam(m.awayTeam);
  const kickoff = toIsoUtc(m.utcDate);
  if (!league || typeof m.id !== "number" || !home || !away || !kickoff) return null;

  const st = toStatus(m);
  const played = st.status === "live" || st.status === "halftime" || st.status === "finished" || st.status === "suspended";
  const sc = matchScores(m.score, played);
  const year = m.season?.startDate?.slice(0, 4);

  return {
    id: makeId("football-data", m.id),
    source: "football-data",
    leagueId: league.id,
    season: year && /^\d{4}$/.test(year) ? year : null,
    round: roundLabel(m),
    kickoff,
    status: st.status,
    statusText: st.statusText,
    clock: st.clock,
    home: { team: home, score: sc.home, penalties: sc.penHome, aggregate: null },
    away: { team: away, score: sc.away, penalties: sc.penAway, aggregate: null },
    venue: m.venue ?? null,
  };
}

export function matchesFromList(list: { matches?: FdMatch[] } | null | undefined): Match[] {
  return (list?.matches ?? []).flatMap((m) => {
    const x = toMatch(m);
    return x ? [x] : [];
  });
}

// ───────────────────────── Detalhe ─────────────────────────

const clockOf = (minute: number | null | undefined, injury: number | null | undefined) => clockText(minute, injury);

/** Linha do tempo a partir de gols, cartões e substituições (a ordem é por minuto). */
export function eventsFromMatch(m: FdMatch): MatchEvent[] {
  const homeId = m.homeTeam?.id;
  const awayId = m.awayTeam?.id;
  const sideByTeam = (id: number | undefined): "home" | "away" | null => (id !== undefined && id === homeId ? "home" : id !== undefined && id === awayId ? "away" : null);

  interface Draft extends MatchEvent {
    sortKey: [number, number];
  }
  const drafts: Draft[] = [];
  const key = (minute: number | null | undefined, injury: number | null | undefined): [number, number] => [minute ?? 0, injury ?? 0];

  let prev: [number, number] = [0, 0];
  [...(m.goals ?? [])]
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || (a.injuryTime ?? 0) - (b.injuryTime ?? 0))
    .forEach((g, i) => {
      const after = goalsPair(g.score);
      // O placar corrido é a fonte mais confiável do lado, inclusive em gol contra
      // (a doc não diz a qual time o `team` de um gol contra se refere).
      const side: "home" | "away" | null = after ? (after[0] > prev[0] ? "home" : after[1] > prev[1] ? "away" : sideByTeam(g.team?.id)) : sideByTeam(g.team?.id);
      if (after) prev = after;
      drafts.push({
        id: `g-${i}`,
        type: g.type === "OWN" ? "own_goal" : g.type === "PENALTY" ? "penalty_goal" : "goal",
        minute: g.minute ?? null,
        clock: clockOf(g.minute, g.injuryTime),
        side,
        player: g.scorer?.name ?? null,
        secondaryPlayer: g.assist?.name ?? null,
        text: null,
        score: after ? { home: after[0], away: after[1] } : null,
        sortKey: key(g.minute, g.injuryTime),
      });
    });

  (m.bookings ?? []).forEach((b, i) => {
    const type = b.card === "RED" ? "red_card" : b.card === "YELLOW_RED" ? "second_yellow" : b.card === "YELLOW" ? "yellow_card" : "other";
    drafts.push({
      id: `b-${i}`,
      type,
      minute: b.minute ?? null,
      clock: clockOf(b.minute, b.injuryTime),
      side: sideByTeam(b.team?.id),
      player: b.player?.name ?? null,
      secondaryPlayer: null,
      text: null,
      score: null,
      sortKey: key(b.minute, b.injuryTime),
    });
  });

  (m.substitutions ?? []).forEach((s, i) => {
    drafts.push({
      id: `s-${i}`,
      type: "substitution",
      minute: s.minute ?? null,
      clock: clockOf(s.minute, s.injuryTime),
      side: sideByTeam(s.team?.id),
      player: s.playerOut?.name ?? null, // quem sai (mesma convenção da ESPN)
      secondaryPlayer: s.playerIn?.name ?? null,
      text: null,
      score: null,
      sortKey: key(s.minute, s.injuryTime),
    });
  });

  return drafts
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d.sortKey[0] - b.d.sortKey[0] || a.d.sortKey[1] - b.d.sortKey[1] || a.i - b.i)
    .map(({ d }) => ({
      id: d.id,
      type: d.type,
      minute: d.minute,
      clock: d.clock,
      side: d.side,
      player: d.player,
      secondaryPlayer: d.secondaryPlayer,
      text: d.text,
      score: d.score,
    }));
}

// Posições que a API devolve em inglês. Valores fora desta lista ficam como vieram.
const POSITIONS: Record<string, string> = {
  Goalkeeper: "G",
  Defence: "D",
  "Centre-Back": "ZAG",
  "Left-Back": "LE",
  "Right-Back": "LD",
  Midfield: "M",
  "Defensive Midfield": "VOL",
  "Central Midfield": "MC",
  "Attacking Midfield": "MEI",
  Offence: "A",
  "Left Winger": "PE",
  "Right Winger": "PD",
  "Centre-Forward": "CA",
};

const toPlayer = (p: FdPlayer): LineupPlayer | null =>
  p.name ? { name: p.name, shirtNumber: typeof p.shirtNumber === "number" ? p.shirtNumber : null, position: p.position ? (POSITIONS[p.position] ?? p.position) : null, captain: false } : null;

export function lineupsFromMatch(m: FdMatch): Lineup[] {
  const one = (side: "home" | "away", t: FdTeamRef | undefined): Lineup[] => {
    const starters = (t?.lineup ?? []).flatMap((p) => toPlayer(p) ?? []);
    const bench = (t?.bench ?? []).flatMap((p) => toPlayer(p) ?? []);
    if (!t || (starters.length === 0 && bench.length === 0)) return []; // escalação é recurso de plano pago
    return [{ side, formation: t.formation ?? null, coach: t.coach?.name ?? null, starters, bench }];
  };
  return [...one("home", m.homeTeam), ...one("away", m.awayTeam)];
}

const STAT_DEFS: Array<{ key: string; label: string; source: string; percent?: boolean }> = [
  { key: "possession", label: "Posse de bola", source: "ball_possession", percent: true },
  { key: "shots", label: "Finalizações", source: "shots" },
  { key: "shotsOnTarget", label: "Finalizações no alvo", source: "shots_on_goal" },
  { key: "corners", label: "Escanteios", source: "corner_kicks" },
  { key: "fouls", label: "Faltas", source: "fouls" },
  { key: "yellowCards", label: "Cartões amarelos", source: "yellow_cards" },
  { key: "redCards", label: "Cartões vermelhos", source: "red_cards" },
  { key: "offsides", label: "Impedimentos", source: "offsides" },
  { key: "saves", label: "Defesas", source: "saves" },
];

const statNumber = (t: FdTeamRef | undefined, name: string): number | null => {
  const v = t?.statistics?.[name];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v)); // "62%" → 62
  return Number.isFinite(n) ? n : null;
};

export function statisticsFromMatch(m: FdMatch): StatLine[] {
  return STAT_DEFS.flatMap((d): StatLine[] => {
    const h = statNumber(m.homeTeam, d.source);
    const a = statNumber(m.awayTeam, d.source);
    if (h === null && a === null) return [];
    const text = (v: number | null) => (v === null ? null : d.percent ? `${Math.round(v)}%` : String(v));
    return [{ key: d.key, label: d.label, home: h, away: a, homeText: text(h), awayText: text(a) }];
  });
}

export function toMatchDetail(m: FdMatch | null | undefined): MatchDetail | null {
  const base = m ? toMatch(m) : null;
  if (!m || !base) return null;
  const ref = m.referees?.find((r) => r.type === "REFEREE");
  return {
    ...base,
    referee: ref?.name ?? null,
    attendance: m.attendance ? m.attendance : null,
    events: eventsFromMatch(m),
    lineups: lineupsFromMatch(m),
    statistics: statisticsFromMatch(m),
  };
}

// ───────────────────────── Classificação ─────────────────────────

/** "GROUP_A" → "Grupo A". */
const groupName = (g: string | null | undefined) => (g ? g.replace(/^GROUP_/, "Grupo ").replace(/_/g, " ") : null);

export function standingsFromFd(json: FdStandings | null | undefined, league: LeagueDef): Standings | null {
  // A API devolve TOTAL, HOME e AWAY; só a tabela geral interessa.
  const tables = (json?.standings ?? []).filter((s) => (s.type ?? "TOTAL") === "TOTAL");
  const groups = tables.flatMap((t) => {
    const rows = (t.table ?? []).flatMap((r, index): StandingRow[] => {
      const team = toTeam(r.team);
      if (!team) return [];
      const position = typeof r.position === "number" ? r.position : index + 1;
      const goalsFor = r.goalsFor ?? 0;
      const goalsAgainst = r.goalsAgainst ?? 0;
      return [
        {
          position,
          team,
          played: r.playedGames ?? 0,
          won: r.won ?? 0,
          drawn: r.draw ?? 0,
          lost: r.lost ?? 0,
          goalsFor,
          goalsAgainst,
          goalDifference: r.goalDifference ?? goalsFor - goalsAgainst,
          points: r.points ?? 0,
          // `form` existe ("W,D,L,…"), mas a doc não diz se começa pelo jogo mais recente ou
          // pelo mais antigo; mostrar na ordem errada seria pior que não mostrar.
          form: null,
          zone: zoneFor(league, position),
        },
      ];
    });
    return rows.length ? [{ name: groupName(t.group), rows: rows.sort((a, b) => a.position - b.position) }] : [];
  });
  if (groups.length === 0) return null;
  const year = json?.season?.startDate?.slice(0, 4);
  return { leagueId: league.id, season: year && /^\d{4}$/.test(year) ? year : null, groups };
}
