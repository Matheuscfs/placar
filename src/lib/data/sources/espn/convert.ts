/**
 * Conversores ESPN → modelo do Placar. Funções PURAS (sem rede, sem relógio),
 * cobertas por testes com respostas reais gravadas em `__fixtures__/`.
 *
 * Regra de ouro: a API da ESPN não é garantida. Cada conversor valida o que usa e
 * devolve `null` (ou omite o item) em vez de lançar, para um jogo malformado não
 * derrubar a lista inteira.
 */
import { findLeagueBySourceCode, zoneFor, type LeagueDef } from "@/lib/domain/leagues";
import { toIsoUtc } from "@/lib/domain/dates";
import { makeId, parseId } from "@/lib/domain/ids";
import { canonicalTeamName, normalizeTeamKey } from "@/lib/domain/team-key";
import type {
  LeagueId,
  Lineup,
  LineupPlayer,
  Match,
  MatchDetail,
  MatchEvent,
  MatchEventType,
  MatchSide,
  MatchStatus,
  StandingRow,
  Standings,
  StandingsGroup,
  StatLine,
  Team,
  Zone,
  ZoneTone,
} from "@/lib/domain/types";
import type {
  EspnBoxscoreTeam,
  EspnCompetition,
  EspnDetail,
  EspnEvent,
  EspnKeyEvent,
  EspnRoster,
  EspnRosterPlayer,
  EspnScore,
  EspnScoreboard,
  EspnStandingEntry,
  EspnStandings,
  EspnStatus,
  EspnSummary,
  EspnTeam,
} from "./espn-types";

// ───────────────────────── Básicos ─────────────────────────

export { toIsoUtc };

export function toTeam(t: EspnTeam | undefined): Team | null {
  if (!t?.id) return null;
  const rawName = t.displayName ?? t.name ?? t.location;
  if (!rawName) return null;
  // Mesmo time, mesmo nome em todos os endpoints (a ESPN às vezes varia: "Athletico Paranaense" × "Athletico-PR").
  const name = canonicalTeamName(rawName);
  const logo = t.logo ?? t.logos?.find((l) => l.rel?.includes("default"))?.href ?? t.logos?.[0]?.href;
  const team: Team = {
    id: makeId("espn", t.id),
    key: normalizeTeamKey(name),
    name,
    shortName: t.shortDisplayName ?? name,
    abbr: t.abbreviation ?? name.slice(0, 3).toUpperCase(),
  };
  if (logo) team.logo = logo;
  if (t.color) team.color = t.color;
  return team;
}

/** O placar vem como texto ("1"), número ou objeto `{ value }`. Vazio/inválido → `null`. */
export function toScore(raw: EspnScore | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object") return toScore(raw.value ?? raw.displayValue);
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const slugify = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");

// ───────────────────────── Status ─────────────────────────

export interface ParsedStatus {
  status: MatchStatus;
  statusText: string | null;
  clock: string | null;
  /** O jogo teve (ou está tendo) disputa de pênaltis. */
  shootout: boolean;
}

/**
 * Mapeia pelo `state` (`pre`/`in`/`post`), que é estável; os nomes (`STATUS_*`) só
 * refinam casos especiais. Nomes de jogo em andamento não foram observados (só
 * histórico), então `in` cai no ramo genérico e usa `period` para o texto.
 */
export function toStatus(s: EspnStatus | undefined): ParsedStatus {
  const name = s?.type?.name ?? "";
  const state = s?.type?.state;
  const shootout = /PEN|SHOOTOUT/.test(name) || s?.period === 5;
  const out = (status: MatchStatus, statusText: string | null, clock: string | null = null): ParsedStatus => ({ status, statusText, clock, shootout });

  if (/POSTPONED/.test(name)) return out("postponed", "Adiado");
  if (/CANCEL/.test(name)) return out("canceled", "Cancelado");
  if (/ABANDON|SUSPEND/.test(name)) return out("suspended", "Interrompido");

  if (state === "in") {
    if (/HALFTIME/.test(name)) return out("halftime", "Intervalo");
    const text = /FIRST_HALF/.test(name)
      ? "1º tempo"
      : /SECOND_HALF/.test(name)
        ? "2º tempo"
        : /EXTRA/.test(name)
          ? "Prorrogação"
          : /SHOOTOUT|PENALT/.test(name)
            ? "Pênaltis"
            : s?.period === 1
              ? "1º tempo"
              : s?.period === 2
                ? "2º tempo"
                : s?.period === 3 || s?.period === 4
                  ? "Prorrogação"
                  : s?.period === 5
                    ? "Pênaltis"
                    : null;
    return out("live", text, s?.displayClock || null);
  }
  if (state === "post") {
    const text = /FINAL_PEN/.test(name) ? "Encerrado (pênaltis)" : /FINAL_AET/.test(name) ? "Encerrado (prorrogação)" : "Encerrado";
    return out("finished", text);
  }
  return out("scheduled", null);
}

// ───────────────────────── Fase / rodada ─────────────────────────

const ROUND_LABELS: Record<string, string> = {
  "first-round": "1ª fase",
  "second-round": "2ª fase",
  "third-round": "3ª fase",
  "fourth-round": "4ª fase",
  "fifth-round": "5ª fase",
  "first-stage": "1ª fase",
  "second-stage": "2ª fase",
  "third-stage": "3ª fase",
  "group-stage": "Fase de grupos",
  "league-phase": "Fase de liga",
  "knockout-round-playoffs": "Playoffs",
  "round-of-16": "Oitavas de final",
  quarterfinals: "Quartas de final",
  semifinals: "Semifinal",
  final: "Final",
};

/**
 * "Quartas de final · Volta". A ESPN não informa a rodada dos pontos corridos
 * (devolve `null`). Usa `season.slug` e, no detalhe da partida (que não o tem), o
 * final de `altGameNote` ("Copa Do Brazil, Quarterfinals").
 */
export function roundLabel(comp: EspnCompetition, seasonSlug?: string): string | null {
  const noteTail = comp.altGameNote?.includes(",") ? comp.altGameNote.split(",").pop() : undefined;
  const base = ROUND_LABELS[seasonSlug ?? ""] ?? (noteTail ? ROUND_LABELS[slugify(noteTail)] : undefined);
  if (!base) return null;
  const leg = comp.leg?.value;
  if ((comp.series?.totalCompetitions ?? 0) > 1 && (leg === 1 || leg === 2)) return `${base} · ${leg === 1 ? "Ida" : "Volta"}`;
  return base;
}

// ───────────────────────── Partida ─────────────────────────

export function toMatch(event: EspnEvent, leagueId: LeagueId, espnSlug: string): Match | null {
  const comp = event.competitions?.[0];
  if (!event.id || !comp) return null;
  const home = comp.competitors?.find((c) => c.homeAway === "home");
  const away = comp.competitors?.find((c) => c.homeAway === "away");
  const homeTeam = toTeam(home?.team);
  const awayTeam = toTeam(away?.team);
  const kickoff = toIsoUtc(comp.date ?? event.date);
  if (!home || !away || !homeTeam || !awayTeam || !kickoff) return null;

  const st = toStatus(comp.status ?? event.status);
  // Adiado/agendado/cancelado trazem "0"/"0" falsos: o placar só vale com a bola rolando.
  const played = st.status === "live" || st.status === "halftime" || st.status === "finished" || st.status === "suspended";
  const twoLegs = (comp.series?.totalCompetitions ?? 0) > 1 && played;

  const side = (c: typeof home, team: Team): MatchSide => ({
    team,
    score: played ? toScore(c.score) : null,
    penalties: played && st.shootout && typeof c.shootoutScore === "number" ? c.shootoutScore : null,
    aggregate: twoLegs && typeof c.aggregateScore === "number" ? c.aggregateScore : null,
  });

  const eventVenue = typeof event.venue === "string" ? event.venue : (event.venue?.fullName ?? event.venue?.displayName);
  return {
    id: makeId("espn", espnSlug, event.id),
    source: "espn",
    leagueId,
    season: event.season?.year != null ? String(event.season.year) : null,
    round: roundLabel(comp, event.season?.slug),
    kickoff,
    status: st.status,
    statusText: st.statusText,
    clock: st.clock,
    home: side(home, homeTeam),
    away: side(away, awayTeam),
    venue: comp.venue?.fullName ?? comp.venue?.displayName ?? eventVenue ?? null,
  };
}

export function matchesFromScoreboard(json: EspnScoreboard | null | undefined, leagueId: LeagueId, espnSlug: string): Match[] {
  return (json?.events ?? []).flatMap((e) => {
    const m = toMatch(e, leagueId, espnSlug);
    return m ? [m] : [];
  });
}

/** Id numérico da liga no `uid` do evento: `s:600~l:630~e:401841272` → `"630"`. */
export function espnLeagueIdOf(event: EspnEvent): string | null {
  return /~l:(\d+)~/.exec(event.uid ?? "")?.[1] ?? null;
}

/**
 * Jogos das ligas do catálogo dentro do feed global (`all/scoreboard`), que mistura centenas de
 * ligas. Eventos de ligas fora de `leagues` são ignorados.
 */
export function matchesFromAllFeed(json: EspnScoreboard | null | undefined, leagues: LeagueDef[]): Match[] {
  const byEspnId = new Map(leagues.flatMap((l) => (l.sources.espnLeagueId && l.sources.espn ? [[l.sources.espnLeagueId, l] as const] : [])));
  return (json?.events ?? []).flatMap((e) => {
    const id = espnLeagueIdOf(e);
    const league = id ? byEspnId.get(id) : undefined;
    const m = league?.sources.espn ? toMatch(e, league.id, league.sources.espn) : null;
    return m ? [m] : [];
  });
}

// ───────────────────────── Eventos ─────────────────────────

interface DraftEvent extends MatchEvent {
  /** Chave de ordenação (período, segundos). */
  order: [number, number];
  /** Pênalti da disputa final: não entra no placar corrido. */
  shootout: boolean;
}

const minuteOf = (displayValue: string | undefined, seconds: number | undefined): number | null => {
  const m = displayValue ? /^(\d+)/.exec(displayValue) : null;
  if (m) return Number(m[1]);
  return typeof seconds === "number" ? Math.floor(seconds / 60) : null;
};

/** Ordena (estável), calcula o placar após cada gol e remove campos internos. */
function finalizeEvents(drafts: DraftEvent[]): MatchEvent[] {
  const sorted = drafts.map((d, i) => ({ d, i })).sort((a, b) => a.d.order[0] - b.d.order[0] || a.d.order[1] - b.d.order[1] || a.i - b.i);
  let home = 0;
  let away = 0;
  return sorted.map(({ d }) => {
    const scores = (d.type === "goal" || d.type === "penalty_goal" || d.type === "own_goal") && !d.shootout && d.side !== null;
    if (scores && d.side === "home") home++;
    else if (scores) away++;
    return {
      id: d.id,
      type: d.type,
      minute: d.minute,
      clock: d.clock,
      side: d.side,
      player: d.player,
      secondaryPlayer: d.secondaryPlayer,
      text: d.text,
      score: scores ? { home, away } : null,
    };
  });
}

const sideOf = (teamId: string | undefined, homeId: string | null, awayId: string | null): "home" | "away" | null =>
  teamId && teamId === homeId ? "home" : teamId && teamId === awayId ? "away" : null;

function keyEventType(type: string, scoring: boolean): MatchEventType | null {
  if (type === "kickoff") return "kickoff";
  if (type === "halftime") return "halftime";
  if (type === "end-regular-time" || type === "end-extra-time") return "fulltime";
  if (/^(start|end)-/.test(type)) return null; // início do 2º tempo, paradas: ruído na linha do tempo
  if (/own-goal/.test(type)) return "own_goal";
  if (/penalty/.test(type)) return scoring ? "penalty_goal" : "missed_penalty"; // gol, trave, defesa, para fora
  if (scoring) return "goal";
  if (/second-yellow|yellow-red/.test(type)) return "second_yellow";
  if (/yellow-card/.test(type)) return "yellow_card";
  if (/red-card/.test(type)) return "red_card";
  if (/substitution/.test(type)) return "substitution";
  if (/\bvar\b|^var/.test(type)) return "var";
  return "other";
}

/**
 * Linha do tempo a partir de `summary.keyEvents` (mais rica: tem substituições, apito
 * inicial, intervalo…). Em gol contra, `team` é o time BENEFICIADO (conferido em jogos
 * reais), então `side` é sempre quem recebe o ponto.
 */
export function eventsFromKeyEvents(keyEvents: EspnKeyEvent[] | undefined, homeId: string | null, awayId: string | null): MatchEvent[] {
  const drafts: DraftEvent[] = [];
  (keyEvents ?? []).forEach((k, i) => {
    const t = keyEventType(k.type?.type ?? "", k.scoringPlay === true);
    if (!t) return;
    const names = (k.participants ?? []).map((p) => p.athlete?.displayName ?? p.athlete?.shortName ?? null);
    const isSub = t === "substitution";
    const shootout = k.shootout === true;
    drafts.push({
      id: k.id ?? `ke-${i}`,
      type: t,
      minute: shootout ? null : minuteOf(k.clock?.displayValue, k.clock?.value),
      clock: shootout ? "Pên." : k.clock?.displayValue || null,
      side: t === "kickoff" || t === "halftime" || t === "fulltime" ? null : sideOf(k.team?.id, homeId, awayId),
      // Substituição: a ESPN lista [quem entra, quem sai]. Aqui `player` = quem sai.
      player: (isSub ? names[1] : names[0]) ?? null,
      secondaryPlayer: (isSub ? names[0] : null) ?? null,
      text: k.text ?? null,
      score: null,
      order: [k.period?.number ?? 0, k.clock?.value ?? 0],
      shootout,
    });
  });
  return finalizeEvents(drafts);
}

/**
 * Alternativa quando o `summary` não traz `keyEvents` (comum em jogos de copa de
 * divisões menores): usa `competition.details`, que só tem gols e cartões.
 */
export function eventsFromDetails(details: EspnDetail[] | undefined, homeId: string | null, awayId: string | null): MatchEvent[] {
  const drafts: DraftEvent[] = [];
  (details ?? []).forEach((d, i) => {
    let t: MatchEventType;
    if (d.scoringPlay) t = d.ownGoal ? "own_goal" : d.penaltyKick ? "penalty_goal" : "goal";
    else if (d.penaltyKick) t = "missed_penalty";
    else if (d.yellowCard && d.redCard) t = "second_yellow";
    else if (d.redCard) t = "red_card";
    else if (d.yellowCard) t = "yellow_card";
    else t = "other";
    const shootout = d.shootout === true;
    const who = d.athletesInvolved?.[0];
    drafts.push({
      id: `d-${i}`,
      type: t,
      minute: shootout ? null : minuteOf(d.clock?.displayValue, d.clock?.value),
      clock: shootout ? "Pên." : d.clock?.displayValue || null,
      side: sideOf(d.team?.id, homeId, awayId),
      player: who?.displayName ?? who?.fullName ?? who?.shortName ?? null,
      secondaryPlayer: null,
      text: d.type?.text ?? null,
      score: null,
      order: [0, d.clock?.value ?? 0],
      shootout,
    });
  });
  return finalizeEvents(drafts);
}

// ───────────────────────── Escalações ─────────────────────────

const toPlayer = (p: EspnRosterPlayer): LineupPlayer | null => {
  const name = p.athlete?.displayName ?? p.athlete?.fullName ?? p.athlete?.shortName;
  if (!name) return null;
  const n = Number(p.jersey);
  return { name, shirtNumber: p.jersey && Number.isFinite(n) ? n : null, position: p.position?.abbreviation ?? null, captain: false };
};

export function lineupsFromRosters(rosters: EspnRoster[] | undefined): Lineup[] {
  return (rosters ?? []).flatMap((r) => {
    if (r.homeAway !== "home" && r.homeAway !== "away") return [];
    const players = r.roster ?? [];
    const starters = players
      .filter((p) => p.starter)
      .sort((a, b) => (Number(a.formationPlace) || 99) - (Number(b.formationPlace) || 99))
      .flatMap((p) => toPlayer(p) ?? []);
    const bench = players.filter((p) => !p.starter).flatMap((p) => toPlayer(p) ?? []);
    if (starters.length === 0 && bench.length === 0) return [];
    // A ESPN não informa técnico nem capitão.
    return [{ side: r.homeAway, formation: r.formation ?? null, coach: null, starters, bench }];
  });
}

// ───────────────────────── Estatísticas ─────────────────────────

const STAT_DEFS: Array<{ key: string; label: string; source: string; percent?: boolean }> = [
  { key: "possession", label: "Posse de bola", source: "possessionPct", percent: true },
  { key: "shots", label: "Finalizações", source: "totalShots" },
  { key: "shotsOnTarget", label: "Finalizações no alvo", source: "shotsOnTarget" },
  { key: "corners", label: "Escanteios", source: "wonCorners" },
  { key: "fouls", label: "Faltas", source: "foulsCommitted" },
  { key: "yellowCards", label: "Cartões amarelos", source: "yellowCards" },
  { key: "redCards", label: "Cartões vermelhos", source: "redCards" },
  { key: "offsides", label: "Impedimentos", source: "offsides" },
  { key: "saves", label: "Defesas", source: "saves" },
  { key: "passes", label: "Passes", source: "totalPasses" },
];

const statNumber = (team: EspnBoxscoreTeam | undefined, name: string): number | null => {
  const s = team?.statistics?.find((x) => x.name === name);
  if (!s) return null;
  const n = typeof s.value === "number" ? s.value : Number(s.displayValue);
  return Number.isFinite(n) ? n : null;
};

export function statisticsFromBoxscore(teams: EspnBoxscoreTeam[] | undefined): StatLine[] {
  const home = teams?.find((t) => t.homeAway === "home");
  const away = teams?.find((t) => t.homeAway === "away");
  if (!home || !away) return [];
  const line = (key: string, label: string, h: number | null, a: number | null, percent: boolean): StatLine | null => {
    if (h === null && a === null) return null;
    const text = (v: number | null) => (v === null ? null : percent ? `${Math.round(v)}%` : String(v));
    return { key, label, home: h, away: a, homeText: text(h), awayText: text(a) };
  };
  const lines: Array<StatLine | null> = STAT_DEFS.map((d) => line(d.key, d.label, statNumber(home, d.source), statNumber(away, d.source), d.percent === true));
  // `passPct` da ESPN vem arredondado a 1 casa (0.9): recalculamos a partir dos passes certos.
  const accuracy = (t: EspnBoxscoreTeam) => {
    const ok = statNumber(t, "accuratePasses");
    const total = statNumber(t, "totalPasses");
    return ok !== null && total ? Math.round((ok / total) * 100) : null;
  };
  lines.push(line("passAccuracy", "Precisão de passes", accuracy(home), accuracy(away), true));
  return lines.flatMap((l) => l ?? []);
}

// ───────────────────────── Detalhe da partida ─────────────────────────

export function toMatchDetail(summary: EspnSummary | null | undefined, leagueId: LeagueId, espnSlug: string, eventId: string): MatchDetail | null {
  const comp = summary?.header?.competitions?.[0];
  if (!summary || !comp) return null;
  const base = toMatch(
    { id: eventId, date: comp.date, season: { year: summary.header?.season?.year }, competitions: [comp] },
    leagueId,
    espnSlug,
  );
  if (!base) return null;

  const rawId = (t: Team) => parseId(t.id).parts[0];
  const homeId = rawId(base.home.team);
  const awayId = rawId(base.away.team);
  const events = summary.keyEvents?.length
    ? eventsFromKeyEvents(summary.keyEvents, homeId, awayId)
    : eventsFromDetails(comp.details, homeId, awayId);

  const officials = summary.gameInfo?.officials ?? [];
  const refereeEntry =
    // Cargo exato: "Assistant Referee", "Fourth Official" e "VAR" não são o árbitro principal.
    officials.find((o) => /^(main )?(referee|árbitro)$/i.test((o.position?.displayName ?? o.position?.name ?? "").trim())) ??
    (officials.length === 1 ? officials[0] : undefined);

  return {
    ...base,
    venue: summary.gameInfo?.venue?.fullName ?? base.venue,
    referee: refereeEntry?.fullName ?? refereeEntry?.displayName ?? null,
    attendance: summary.gameInfo?.attendance ? summary.gameInfo.attendance : null,
    events,
    lineups: lineupsFromRosters(summary.rosters),
    statistics: statisticsFromBoxscore(summary.boxscore?.teams),
  };
}

// ───────────────────────── Classificação ─────────────────────────

const ZONE_RULES: Array<[RegExp, ZoneTone, string | null]> = [
  [/relegat/i, "relegation", "Rebaixamento"],
  [/champions league/i, "qualification", "Champions League"],
  [/libertadores/i, "qualification", "Libertadores"],
  [/round of 16/i, "qualification", "Oitavas de final"],
  [/promotion|promoted/i, "title", "Acesso"],
  [/conference/i, "playoff", "Conference League"],
  [/europa league/i, "playoff", "Europa League"],
  [/sudamericana|sul-americana/i, "playoff", "Sul-Americana"],
];

/** Zona informada pela própria ESPN (`entry.note`). Descrições desconhecidas são mantidas como vieram. */
export function zoneFromNote(note: EspnStandingEntry["note"]): Zone | null {
  const description = note?.description?.trim();
  if (!description) return null;
  for (const [re, tone, label] of ZONE_RULES) {
    if (re.test(description)) return { key: slugify(label ?? description), label: label ?? description, tone };
  }
  return { key: slugify(description), label: description, tone: "playoff" };
}

const groupLabel = (name: string | undefined, onlyOne: boolean): string | null => {
  if (onlyOne || !name) return null;
  return name.replace(/^Group\b/i, "Grupo");
};

export function standingsFromEspn(json: EspnStandings | null | undefined, league: LeagueDef): Standings | null {
  const children = json?.children ?? [];
  if (children.length === 0) return null;

  const groups: StandingsGroup[] = children.map((child) => {
    const rows = (child.standings?.entries ?? []).flatMap((entry, index): StandingRow[] => {
      const team = toTeam(entry.team);
      if (!team) return [];
      const stat = (name: string) => {
        const s = entry.stats?.find((x) => x.name === name);
        return typeof s?.value === "number" ? s.value : Number.isFinite(Number(s?.displayValue)) && s?.displayValue ? Number(s.displayValue) : 0;
      };
      const position = stat("rank") || index + 1;
      const goalsFor = stat("pointsFor");
      const goalsAgainst = stat("pointsAgainst");
      return [
        {
          position,
          team,
          played: stat("gamesPlayed"),
          won: stat("wins"),
          drawn: stat("ties"),
          lost: stat("losses"),
          goalsFor,
          goalsAgainst,
          goalDifference: entry.stats?.some((x) => x.name === "pointDifferential") ? stat("pointDifferential") : goalsFor - goalsAgainst,
          points: stat("points"),
          form: null, // a ESPN não informa a sequência de resultados na tabela
          zone: zoneFromNote(entry.note) ?? zoneFor(league, position),
        },
      ];
    });
    rows.sort((a, b) => a.position - b.position);
    return { name: groupLabel(child.name, children.length === 1), rows };
  });

  return { leagueId: league.id, season: json?.season?.year != null ? String(json.season.year) : null, groups: groups.filter((g) => g.rows.length > 0) };
}

// ───────────────────────── Time ─────────────────────────

/** Liga do catálogo para um jogo da agenda do time; `null` se for competição que o Placar não cobre. */
export function leagueOfScheduleEvent(e: EspnEvent): { league: LeagueDef; espnSlug: string } | null {
  const slug = e.league?.slug;
  const league = slug ? findLeagueBySourceCode("espn", slug) : undefined;
  return slug && league ? { league, espnSlug: slug } : null;
}

export function matchesFromSchedule(events: EspnEvent[] | undefined): Match[] {
  return (events ?? []).flatMap((e) => {
    const l = leagueOfScheduleEvent(e);
    const m = l ? toMatch(e, l.league.id, l.espnSlug) : null;
    return m ? [m] : [];
  });
}
