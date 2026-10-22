import { describe, expect, it } from "vitest";
import { getLeagueDef } from "@/lib/domain/leagues";
// Fixtures escritas a partir da documentação (não são respostas reais): ver __fixtures__/LEIA-ME.md
import matchDetail from "./__fixtures__/match-detail.json";
import matchesList from "./__fixtures__/matches-list.json";
import standingsBsa from "./__fixtures__/standings-bsa.json";
import standingsCl from "./__fixtures__/standings-cl-groups.json";
import {
  clockText,
  eventsFromMatch,
  goalsPair,
  lineupsFromMatch,
  matchScores,
  matchesFromList,
  roundLabel,
  standingsFromFd,
  statisticsFromMatch,
  toMatch,
  toMatchDetail,
  toStatus,
  toTeam,
} from "./convert";
import type { FdMatch, FdMatchList, FdStandings } from "./fd-types";

const as = <T>(v: unknown) => v as T;
const list = as<FdMatchList>(matchesList);
const byId = (id: number) => matchesFromList(list).find((m) => m.id === `football-data:${id}`)!;

describe("básicos", () => {
  it("lê o placar nas duas formas de chave (home/away da v4 e homeTeam/awayTeam do exemplo antigo)", () => {
    expect(goalsPair({ home: 2, away: 1 })).toEqual([2, 1]);
    expect(goalsPair({ homeTeam: 2, awayTeam: 0 })).toEqual([2, 0]);
    expect(goalsPair({ home: 0, away: 0 })).toEqual([0, 0]); // zero é placar, não ausência
    expect(goalsPair({ home: null, away: null })).toBeNull();
    expect(goalsPair({ home: 1 })).toBeNull();
    expect(goalsPair(undefined)).toBeNull();
  });

  it("time: chave e nome vêm do nome COMPLETO, não do shortName abreviado ('Man City')", () => {
    const t = toTeam({ id: 65, name: "Manchester City FC", shortName: "Man City", tla: "MCI", crest: "https://crests.football-data.org/65.png" })!;
    expect(t).toEqual({ id: "football-data:65", key: "manchester-city", name: "Manchester City", shortName: "Manchester City", abbr: "MCI", logo: "https://crests.football-data.org/65.png" });
  });

  it("aliases levam ao time canônico da ESPN", () => {
    expect(toTeam({ id: 1, name: "SC Corinthians Paulista" })).toMatchObject({ key: "corinthians", name: "Corinthians" });
    expect(toTeam({ id: 5, name: "FC Bayern München" })).toMatchObject({ key: "bayern-munich", name: "Bayern Munich" });
  });

  it("sem tla, deriva a sigla; sem escudo, não inventa", () => {
    const t = toTeam({ id: 9, name: "Borussia Dortmund" })!;
    expect(t.abbr).toBe("BOR");
    expect(t.logo).toBeUndefined();
  });

  it("time sem id ou sem nome é inválido", () => {
    expect(toTeam(undefined)).toBeNull();
    expect(toTeam({ name: "Sem id" })).toBeNull();
    expect(toTeam({ id: 1 })).toBeNull();
  });

  it("relógio no mesmo formato da ESPN", () => {
    expect(clockText(67, null)).toBe("67'");
    expect(clockText(90, 7)).toBe("90'+7'");
    expect(clockText(90, 0)).toBe("90'");
    expect(clockText(null, 3)).toBeNull();
    expect(clockText(undefined, undefined)).toBeNull();
  });
});

describe("status", () => {
  const st = (status: string, extra: Partial<FdMatch> = {}) => toStatus({ status, ...extra });

  it.each([
    ["SCHEDULED", "scheduled", null],
    ["TIMED", "scheduled", null],
    ["IN_PLAY", "live", "Ao vivo"],
    ["EXTRA_TIME", "live", "Prorrogação"],
    ["PENALTY_SHOOTOUT", "live", "Pênaltis"],
    ["PAUSED", "halftime", "Intervalo"],
    ["FINISHED", "finished", "Encerrado"],
    ["AWARDED", "finished", "Encerrado (W.O.)"],
    ["POSTPONED", "postponed", "Adiado"],
    ["SUSPENDED", "suspended", "Interrompido"],
    ["CANCELLED", "canceled", "Cancelado"],
  ])("%s → %s", (status, expected, text) => {
    expect(st(status)).toMatchObject({ status: expected, statusText: text });
  });

  it("encerrado depois de prorrogação ou pênaltis pela `duration`", () => {
    expect(st("FINISHED", { score: { duration: "EXTRA_TIME" } }).statusText).toBe("Encerrado (prorrogação)");
    expect(st("FINISHED", { score: { duration: "PENALTY_SHOOTOUT" } })).toMatchObject({ statusText: "Encerrado (pênaltis)", shootout: true });
  });

  it("ao vivo: relógio quando a fonte informa o minuto, nulo quando não", () => {
    expect(st("IN_PLAY", { minute: 67 }).clock).toBe("67'");
    expect(st("IN_PLAY").clock).toBeNull();
    expect(st("PAUSED", { minute: 45 }).clock).toBeNull();
  });

  it("status desconhecido não quebra: vira agendado", () => {
    expect(st("ALGO_NOVO").status).toBe("scheduled");
    expect(toStatus({}).status).toBe("scheduled");
  });
});

describe("fase / rodada", () => {
  it("pontos corridos: rodada; sem número de rodada, nada", () => {
    expect(roundLabel({ stage: "REGULAR_SEASON", matchday: 31 })).toBe("Rodada 31");
    expect(roundLabel({ stage: "REGULAR_SEASON", matchday: null })).toBeNull();
  });

  it("fases de mata-mata e de grupos", () => {
    expect(roundLabel({ stage: "QUARTER_FINALS" })).toBe("Quartas de final");
    expect(roundLabel({ stage: "SEMI_FINALS" })).toBe("Semifinal");
    expect(roundLabel({ stage: "LAST_16" })).toBe("Oitavas de final");
    expect(roundLabel({ stage: "FINAL" })).toBe("Final");
    expect(roundLabel({ stage: "GROUP_STAGE", matchday: 3 })).toBe("Fase de grupos · Rodada 3");
    expect(roundLabel({ stage: "GROUP_STAGE" })).toBe("Fase de grupos");
    expect(roundLabel({ stage: "ESTAGIO_NOVO" })).toBeNull();
    expect(roundLabel({})).toBeNull();
  });
});

describe("placar do jogo vs. pênaltis", () => {
  // Exemplo da documentação: fullTime 7-6 = regularTime 1-1 + extraTime 0-0 + penalties 6-5
  it("`fullTime` inclui os pênaltis: o placar do jogo é fullTime − penalties", () => {
    const s = { duration: "PENALTY_SHOOTOUT", fullTime: { home: 7, away: 6 }, regularTime: { home: 1, away: 1 }, extraTime: { home: 0, away: 0 }, penalties: { home: 6, away: 5 } };
    expect(matchScores(s, true)).toEqual({ home: 1, away: 1, penHome: 6, penAway: 5 });
  });

  it("jogo normal ou com prorrogação: fullTime vale como está", () => {
    expect(matchScores({ duration: "REGULAR", fullTime: { home: 2, away: 0 } }, true)).toEqual({ home: 2, away: 0, penHome: null, penAway: null });
    expect(matchScores({ duration: "EXTRA_TIME", fullTime: { home: 3, away: 2 }, regularTime: { home: 2, away: 2 }, extraTime: { home: 1, away: 0 } }, true).home).toBe(3);
  });

  it("não deixa o placar do jogo ficar negativo se a fonte vier inconsistente", () => {
    expect(matchScores({ duration: "PENALTY_SHOOTOUT", fullTime: { home: 1, away: 1 }, penalties: { home: 5, away: 4 } }, true)).toMatchObject({ home: 0, away: 0 });
  });

  it("jogo que não começou não tem placar, mesmo com zeros na resposta", () => {
    expect(matchScores({ fullTime: { home: 0, away: 0 } }, false)).toEqual({ home: null, away: null, penHome: null, penAway: null });
    expect(matchScores(undefined, true).home).toBeNull();
  });
});

describe("partida (lista, formato da documentação)", () => {
  const all = matchesFromList(list);

  it("converte as competições do catálogo e descarta as de fora e as malformadas", () => {
    expect(list.matches).toHaveLength(12);
    expect(all).toHaveLength(10);
    expect(all.find((m) => m.id === "football-data:1008")).toBeUndefined(); // Championship não está no catálogo
    expect(all.find((m) => m.id === "football-data:1009")).toBeUndefined(); // sem time visitante
    expect(matchesFromList(undefined)).toEqual([]);
    expect(matchesFromList({})).toEqual([]);
  });

  it("encerrado: placar, rodada, local, temporada, escudo e nomes limpos", () => {
    expect(byId(1001)).toMatchObject({
      id: "football-data:1001",
      source: "football-data",
      leagueId: "brasileirao-a",
      season: "2026",
      round: "Rodada 31",
      kickoff: "2026-10-19T23:00:00Z",
      status: "finished",
      statusText: "Encerrado",
      clock: null,
      venue: "Neo Química Arena",
    });
    const m = byId(1001);
    expect([m.home.score, m.away.score]).toEqual([1, 1]);
    expect([m.home.team.name, m.away.team.name]).toEqual(["Corinthians", "Vitória"]);
    expect(m.home.team.logo).toBe("https://crests.football-data.org/1779.png");
  });

  it("ao vivo, intervalo e prorrogação", () => {
    expect(byId(1002)).toMatchObject({ status: "live", statusText: "Ao vivo", clock: "67'" });
    expect([byId(1002).home.score, byId(1002).away.score]).toEqual([2, 1]);
    expect(byId(1003)).toMatchObject({ status: "halftime", statusText: "Intervalo", clock: null });
    expect(byId(1011)).toMatchObject({ status: "live", statusText: "Prorrogação", clock: "105'+2'" });
  });

  it("agendado e adiado: sem placar", () => {
    for (const id of [1004, 1005]) {
      const m = byId(id);
      expect([m.home.score, m.away.score], String(id)).toEqual([null, null]);
    }
    expect(byId(1004)).toMatchObject({ status: "scheduled", round: "Rodada 32" });
    expect(byId(1005).status).toBe("postponed");
  });

  it("pênaltis na Champions: 1-1 no jogo e 6-5 nos pênaltis", () => {
    const m = byId(1006);
    expect(m).toMatchObject({ leagueId: "champions-league", status: "finished", statusText: "Encerrado (pênaltis)", round: "Quartas de final" });
    expect([m.home.score, m.away.score, m.home.penalties, m.away.penalties]).toEqual([1, 1, 6, 5]);
    expect(m.home.team.name).toBe("Bayern Munich");
    expect(m.away.team.name).toBe("Manchester City");
  });

  it("prorrogação sem pênaltis: placar após os 120 minutos, sem pênaltis", () => {
    const m = byId(1007);
    expect(m.statusText).toBe("Encerrado (prorrogação)");
    expect([m.home.score, m.away.score, m.home.penalties]).toEqual([3, 2, null]);
  });

  it("placar com as chaves antigas (homeTeam/awayTeam)", () => {
    expect([byId(1010).home.score, byId(1010).away.score]).toEqual([2, 0]);
  });

  it("W.O. (AWARDED) conta como encerrado", () => {
    expect(byId(1012)).toMatchObject({ status: "finished", statusText: "Encerrado (W.O.)" });
  });

  it("todo id é único e qualificado pela fonte", () => {
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length);
    expect(all.every((m) => /^football-data:\d+$/.test(m.id))).toBe(true);
  });

  it("data inválida ou id ausente → null", () => {
    const base = list.matches![0];
    expect(toMatch({ ...base, utcDate: "lixo" })).toBeNull();
    expect(toMatch({ ...base, id: undefined })).toBeNull();
    expect(toMatch({ ...base, competition: undefined })).toBeNull();
  });
});

describe("detalhe da partida (formato da documentação)", () => {
  const raw = as<FdMatch>(matchDetail);
  const detail = toMatchDetail(raw)!;

  it("partida base + árbitro principal (não o auxiliar) e público", () => {
    expect(detail).toMatchObject({ id: "football-data:1001", status: "finished", referee: "Árbitro Principal", attendance: 41230, venue: "Neo Química Arena" });
    expect([detail.home.score, detail.away.score]).toEqual([1, 1]);
  });

  it("linha do tempo em ordem cronológica, com lado e placar corrido nos gols", () => {
    expect(detail.events.map((e) => [e.type, e.clock, e.side, e.player])).toEqual([
      ["goal", "45'+1'", "away", "Renê"],
      ["yellow_card", "53'", "away", "Renê"],
      ["second_yellow", "60'", "home", "Rodrigo Garro"],
      ["penalty_goal", "66'", "home", "Yuri Alberto"],
      ["substitution", "67'", "home", "Vitinho"],
      ["red_card", "88'", "away", "Zé Vitor"],
    ]);
    expect(detail.events[0]).toMatchObject({ score: { home: 0, away: 1 }, secondaryPlayer: "Matheuzinho" }); // assistência
    expect(detail.events[3].score).toEqual({ home: 1, away: 1 });
    expect(detail.events[4].secondaryPlayer).toBe("Kaio César"); // quem entra
  });

  it("gol contra: o lado vem do placar corrido, não do `team` (a doc não diz a qual time ele se refere)", () => {
    const ownGoal: FdMatch = {
      ...raw,
      goals: [{ minute: 10, type: "OWN", team: { id: raw.homeTeam!.id }, scorer: { name: "Zagueiro" }, score: { home: 0, away: 1 } }],
      bookings: [],
      substitutions: [],
    };
    expect(eventsFromMatch(ownGoal)[0]).toMatchObject({ type: "own_goal", side: "away", score: { home: 0, away: 1 } });
  });

  it("sem placar corrido no gol, usa o time", () => {
    const m: FdMatch = { ...raw, goals: [{ minute: 5, type: "REGULAR", team: { id: raw.awayTeam!.id }, scorer: { name: "X" } }], bookings: [], substitutions: [] };
    expect(eventsFromMatch(m)[0]).toMatchObject({ side: "away", score: null });
  });

  it("escalações com posição abreviada em português; posição ausente fica nula; sem dados → vazio", () => {
    const [home, away] = lineupsFromMatch(raw);
    expect(home).toMatchObject({ side: "home", formation: "4-2-3-1", coach: "Dorival Júnior" });
    expect(home.starters.map((p) => p.position)).toEqual(["G", "ZAG", "CA", null]);
    expect(home.starters[0]).toEqual({ name: "Hugo Souza", shirtNumber: 1, position: "G", captain: false });
    expect(home.bench).toHaveLength(1);
    expect(away).toMatchObject({ side: "away", formation: "4-1-4-1" });
    expect(lineupsFromMatch({ ...raw, homeTeam: { ...raw.homeTeam, lineup: [], bench: [] }, awayTeam: {} })).toEqual([]);
  });

  it("estatísticas em português, com posse formatada como porcentagem", () => {
    const stats = Object.fromEntries(statisticsFromMatch(raw).map((s) => [s.key, s]));
    expect(stats.possession).toMatchObject({ label: "Posse de bola", home: 68, away: 32, homeText: "68%", awayText: "32%" });
    expect(stats.shots).toMatchObject({ home: 21, away: 5 });
    expect(stats.shotsOnTarget).toMatchObject({ home: 6, away: 5 });
    expect(stats.redCards).toMatchObject({ home: 0, away: 1 });
  });

  it("estatística só de um lado fica com o outro nulo; sem nenhuma, a linha some", () => {
    const stats = Object.fromEntries(statisticsFromMatch(raw).map((s) => [s.key, s]));
    expect(stats.saves).toMatchObject({ home: 4, away: 5 });
    expect(statisticsFromMatch({ homeTeam: { statistics: { corner_kicks: 3 } }, awayTeam: {} })).toEqual([
      { key: "corners", label: "Escanteios", home: 3, away: null, homeText: "3", awayText: null },
    ]);
    expect(statisticsFromMatch({ homeTeam: {}, awayTeam: {} })).toEqual([]);
  });

  it("plano grátis (sem gols, cartões, escalações nem estatísticas): campos vazios, sem erro", () => {
    const free: FdMatch = { id: 1, competition: { code: "BSA" }, utcDate: "2026-10-19T23:00:00Z", status: "FINISHED", homeTeam: { id: 1, name: "A FC" }, awayTeam: { id: 2, name: "B FC" }, score: { fullTime: { home: 1, away: 0 } } };
    expect(toMatchDetail(free)).toMatchObject({ events: [], lineups: [], statistics: [], referee: null, attendance: null });
  });

  it("partida inválida → null", () => {
    expect(toMatchDetail(null)).toBeNull();
    expect(toMatchDetail({})).toBeNull();
  });
});

describe("classificação (formato da documentação)", () => {
  it("usa só a tabela TOTAL (ignora HOME e AWAY), com zonas do catálogo", () => {
    const s = standingsFromFd(as<FdStandings>(standingsBsa), getLeagueDef("brasileirao-a"))!;
    expect(s).toMatchObject({ leagueId: "brasileirao-a", season: "2026" });
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].name).toBeNull();
    const rows = s.groups[0].rows;
    expect(rows).toHaveLength(20);
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(rows[0].team.name).toBe("Flamengo");
    expect(rows[0].zone).toMatchObject({ key: "libertadores" });
    expect(rows[19].zone).toMatchObject({ key: "relegation" });
    for (const r of rows) expect(r.points).toBe(r.won * 3 + r.drawn);
    expect(rows[0].played).toBe(31); // 31 jogos na TOTAL; HOME teria 15
  });

  it("`form` fica nulo: a doc não diz em que ordem vem", () => {
    const s = standingsFromFd(as<FdStandings>(standingsBsa), getLeagueDef("brasileirao-a"))!;
    expect(s.groups[0].rows.every((r) => r.form === null)).toBe(true);
  });

  it("fase de grupos: um grupo por GROUP_X, nomeado em português", () => {
    const s = standingsFromFd(as<FdStandings>(standingsCl), getLeagueDef("champions-league"))!;
    expect(s.groups.map((g) => g.name)).toEqual(["Grupo A", "Grupo B"]);
    expect(s.groups[0].rows).toHaveLength(4);
  });

  it("sem tabela TOTAL ou sem dados → null", () => {
    expect(standingsFromFd({ standings: [{ type: "HOME", table: [] }] }, getLeagueDef("brasileirao-a"))).toBeNull();
    expect(standingsFromFd({}, getLeagueDef("brasileirao-a"))).toBeNull();
    expect(standingsFromFd(null, getLeagueDef("brasileirao-a"))).toBeNull();
  });
});
