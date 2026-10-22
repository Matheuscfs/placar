import { describe, expect, it } from "vitest";
import { getLeagueDef } from "@/lib/domain/leagues";
import scheduledDay from "./__fixtures__/scoreboard-bra1-scheduled.json";
import finishedDay from "./__fixtures__/scoreboard-bra1-finished.json";
import edge from "./__fixtures__/events-edge-cases.json";
import summaryFinished from "./__fixtures__/summary-bra1-finished.json";
import summaryNoKeyEvents from "./__fixtures__/summary-penalties-no-keyevents.json";
import summaryOwnGoal from "./__fixtures__/summary-owngoal.json";
import standingsBr from "./__fixtures__/standings-bra1.json";
import standingsEng from "./__fixtures__/standings-eng1.json";
import standingsLib from "./__fixtures__/standings-libertadores.json";
import teamSchedule from "./__fixtures__/team-schedule-all.json";
import teamFixture from "./__fixtures__/team-schedule-fixture.json";
import {
  eventsFromDetails,
  matchesFromSchedule,
  matchesFromScoreboard,
  roundLabel,
  standingsFromEspn,
  toIsoUtc,
  toMatch,
  toMatchDetail,
  toScore,
  toStatus,
  toTeam,
  zoneFromNote,
} from "./convert";
import type { EspnDetail, EspnEvent, EspnScoreboard, EspnStandings, EspnSummary, EspnTeamSchedule } from "./espn-types";

// As fixtures são respostas reais da ESPN (podadas); o cast evita tipar o JSON inteiro.
const as = <T>(v: unknown) => v as T;
const edgeEvent = (key: keyof typeof edge) => {
  const e = edge[key] as { espnLeague: string; event: unknown };
  return { slug: e.espnLeague, event: as<EspnEvent>(e.event) };
};

describe("básicos", () => {
  it("normaliza o instante para ISO com segundos", () => {
    expect(toIsoUtc("2026-10-19T23:00Z")).toBe("2026-10-19T23:00:00Z");
    expect(toIsoUtc("lixo")).toBeNull();
    expect(toIsoUtc(undefined)).toBeNull();
  });

  it("lê o placar em texto, número e objeto; vazio vira null", () => {
    expect(toScore("2")).toBe(2);
    expect(toScore(0)).toBe(0);
    expect(toScore({ value: 3, displayValue: "3" })).toBe(3);
    expect(toScore({ displayValue: "1" })).toBe(1);
    expect(toScore("")).toBeNull();
    expect(toScore(null)).toBeNull();
    expect(toScore("abc")).toBeNull();
  });

  it("converte time com id qualificado, chave estável e escudo", () => {
    const t = toTeam({ id: "874", displayName: "Corinthians", shortDisplayName: "Corinthians", abbreviation: "COR", color: "000000", logo: "https://x/874.png" });
    expect(t).toEqual({ id: "espn:874", key: "corinthians", name: "Corinthians", shortName: "Corinthians", abbr: "COR", logo: "https://x/874.png", color: "000000" });
  });

  it("usa a variante `default` de logos e deriva a sigla quando falta", () => {
    const t = toTeam({ id: "1", displayName: "São Paulo", logos: [{ href: "dark.png", rel: ["full", "dark"] }, { href: "def.png", rel: ["full", "default"] }] });
    expect(t?.logo).toBe("def.png");
    expect(t?.abbr).toBe("SÃO");
    expect(t?.key).toBe("sao-paulo");
  });

  it("rejeita time sem id ou sem nome", () => {
    expect(toTeam(undefined)).toBeNull();
    expect(toTeam({ displayName: "Sem id" })).toBeNull();
    expect(toTeam({ id: "1" })).toBeNull();
  });
});

describe("status", () => {
  const st = (name: string, state: string, extra: Record<string, unknown> = {}) => toStatus({ type: { name, state }, ...extra });

  it("agendado", () => {
    expect(st("STATUS_SCHEDULED", "pre")).toMatchObject({ status: "scheduled", statusText: null, clock: null });
  });

  it("encerrado, com pênaltis e com prorrogação (nomes observados na ESPN)", () => {
    expect(st("STATUS_FULL_TIME", "post")).toMatchObject({ status: "finished", statusText: "Encerrado", shootout: false });
    expect(st("STATUS_FINAL_PEN", "post", { period: 5 })).toMatchObject({ status: "finished", statusText: "Encerrado (pênaltis)", shootout: true });
    expect(st("STATUS_FINAL_AET", "post")).toMatchObject({ status: "finished", statusText: "Encerrado (prorrogação)" });
  });

  it("adiado e interrompido têm `state: post`, mas não são encerrados", () => {
    expect(st("STATUS_POSTPONED", "post")).toMatchObject({ status: "postponed", statusText: "Adiado" });
    expect(st("STATUS_ABANDONED", "post")).toMatchObject({ status: "suspended", statusText: "Interrompido" });
    expect(st("STATUS_CANCELED", "post")).toMatchObject({ status: "canceled" });
  });

  // Nomes de jogo em andamento ainda não foram observados na ESPN: estes casos usam
  // `state: "in"` + `period`, que é o que o conversor realmente consulta.
  it("ao vivo: texto pelo período e relógio da fonte", () => {
    expect(st("STATUS_FIRST_HALF", "in", { displayClock: "23'", period: 1 })).toMatchObject({ status: "live", statusText: "1º tempo", clock: "23'" });
    expect(st("QUALQUER_NOME", "in", { displayClock: "67'", period: 2 })).toMatchObject({ status: "live", statusText: "2º tempo", clock: "67'" });
    expect(st("QUALQUER_NOME", "in", { displayClock: "105'", period: 3 })).toMatchObject({ statusText: "Prorrogação" });
    expect(st("QUALQUER_NOME", "in", { period: 5 })).toMatchObject({ statusText: "Pênaltis", shootout: true });
  });

  it("intervalo: sem relógio", () => {
    expect(st("STATUS_HALFTIME", "in", { displayClock: "45'", period: 1 })).toMatchObject({ status: "halftime", statusText: "Intervalo", clock: null });
  });

  it("estado desconhecido cai em agendado em vez de quebrar", () => {
    expect(toStatus(undefined).status).toBe("scheduled");
    expect(st("X", "weird").status).toBe("scheduled");
  });
});

describe("fase / rodada", () => {
  it("traduz a fase e marca ida/volta só em confrontos de dois jogos", () => {
    expect(roundLabel({}, "quarterfinals")).toBe("Quartas de final");
    expect(roundLabel({ series: { totalCompetitions: 2 }, leg: { value: 1 } }, "semifinals")).toBe("Semifinal · Ida");
    expect(roundLabel({ series: { totalCompetitions: 2 }, leg: { value: 2 } }, "round-of-16")).toBe("Oitavas de final · Volta");
    expect(roundLabel({ series: { totalCompetitions: 1 }, leg: { value: 1 } }, "final")).toBe("Final");
  });

  it("usa o fim de altGameNote quando não há slug (detalhe da partida)", () => {
    expect(roundLabel({ altGameNote: "Copa Do Brazil, Quarterfinals" })).toBe("Quartas de final");
  });

  it("pontos corridos e fases desconhecidas ficam sem rodada", () => {
    expect(roundLabel({ altGameNote: "Brazil Serie A" }, "2026-brasileiro-serie-a")).toBeNull();
    expect(roundLabel({ altGameNote: "X, Fase Inventada" })).toBeNull();
  });
});

describe("partida (scoreboard)", () => {
  it("jogo encerrado: placar, local, horário em UTC e id qualificado com a liga", () => {
    const [m] = matchesFromScoreboard(as<EspnScoreboard>(finishedDay), "brasileirao-a", "bra.1");
    expect(m).toMatchObject({
      id: "espn:bra.1:401841272",
      source: "espn",
      leagueId: "brasileirao-a",
      season: "2026",
      round: null,
      kickoff: "2026-10-19T23:00:00Z",
      status: "finished",
      statusText: "Encerrado",
      clock: null,
      venue: "Neo Química Arena",
    });
    expect(m.home.team.name).toBe("Corinthians");
    expect(m.away.team.name).toBe("Vitória");
    expect([m.home.score, m.away.score]).toEqual([1, 1]);
    expect(m.home.team.logo).toMatch(/^https:\/\//);
  });

  it("mandante/visitante vêm de `homeAway`, não da ordem do nome ('Vitória at Corinthians')", () => {
    const [m] = matchesFromScoreboard(as<EspnScoreboard>(finishedDay), "brasileirao-a", "bra.1");
    expect(m.home.team.key).toBe("corinthians");
  });

  it("jogo agendado não tem placar", () => {
    const ms = matchesFromScoreboard(as<EspnScoreboard>(scheduledDay), "brasileirao-a", "bra.1");
    expect(ms).toHaveLength(3);
    for (const m of ms) {
      expect(m.status).toBe("scheduled");
      expect([m.home.score, m.away.score]).toEqual([null, null]);
    }
  });

  it("adiado: o '0 x 0' falso da ESPN vira placar nulo", () => {
    const { slug, event } = edgeEvent("postponed");
    const m = toMatch(event, "brasileirao-a", slug)!;
    expect(m.status).toBe("postponed");
    expect([m.home.score, m.away.score]).toEqual([null, null]);
  });

  it("interrompido mantém o placar parcial", () => {
    const { slug, event } = edgeEvent("abandoned");
    const m = toMatch(event, "la-liga", slug)!;
    expect(m.status).toBe("suspended");
    expect([m.home.score, m.away.score]).toEqual([0, 0]);
  });

  it("disputa de pênaltis: placar do jogo + placar dos pênaltis", () => {
    const { slug, event } = edgeEvent("penalties");
    const m = toMatch(event, "copa-do-brasil", slug)!;
    expect(m.statusText).toBe("Encerrado (pênaltis)");
    expect([m.home.score, m.away.score]).toEqual([1, 1]);
    expect([m.home.penalties, m.away.penalties]).toEqual([1, 3]);
    expect(m.round).toBe("1ª fase");
  });

  it("jogo normal não herda pênaltis", () => {
    const [m] = matchesFromScoreboard(as<EspnScoreboard>(finishedDay), "brasileirao-a", "bra.1");
    expect([m.home.penalties, m.away.penalties]).toEqual([null, null]);
  });

  it("mata-mata de ida e volta: placar agregado e fase", () => {
    const { slug, event } = edgeEvent("aggregate");
    const m = toMatch(event, "copa-do-brasil", slug)!;
    expect(m.round).toBe("5ª fase · Volta");
    expect([m.home.score, m.away.score]).toEqual([3, 2]);
    expect([m.home.aggregate, m.away.aggregate]).toEqual([5, 3]);
  });

  it("jogo de volta ainda não disputado: agregado '0' da ESPN não vira informação", () => {
    const { slug, event } = edgeEvent("upcomingLeg");
    const m = toMatch(event, "libertadores", slug)!;
    expect(m.status).toBe("scheduled");
    expect(m.round).toBe("Semifinal · Volta");
    expect([m.home.aggregate, m.away.aggregate]).toEqual([null, null]);
  });

  it("descarta jogos malformados em vez de derrubar a lista", () => {
    const base = as<EspnScoreboard>(finishedDay).events![0];
    const semVisitante: EspnEvent = { ...base, competitions: [{ ...base.competitions![0], competitors: base.competitions![0].competitors!.filter((c) => c.homeAway === "home") }] };
    const semData: EspnEvent = { ...base, date: undefined, competitions: [{ ...base.competitions![0], date: undefined }] };
    const semId: EspnEvent = { ...base, id: undefined };
    const ms = matchesFromScoreboard({ events: [semVisitante, semData, semId, base] }, "brasileirao-a", "bra.1");
    expect(ms).toHaveLength(1);
    expect(matchesFromScoreboard(undefined, "brasileirao-a", "bra.1")).toEqual([]);
    expect(matchesFromScoreboard({}, "brasileirao-a", "bra.1")).toEqual([]);
  });
});

describe("detalhe da partida (summary)", () => {
  const detail = () => toMatchDetail(as<EspnSummary>(summaryFinished), "brasileirao-a", "bra.1", "401841272")!;

  it("monta a partida a partir do header e usa o estádio do gameInfo", () => {
    const d = detail();
    expect(d.id).toBe("espn:bra.1:401841272");
    expect(d.status).toBe("finished");
    expect([d.home.score, d.away.score]).toEqual([1, 1]);
    expect(d.venue).toBe("Neo Química Arena");
  });

  it("árbitro e público ausentes ficam nulos (a ESPN quase nunca informa)", () => {
    const d = detail();
    expect(d.referee).toBeNull();
    expect(d.attendance).toBeNull();
  });

  it("linha do tempo: gols com placar corrido, cartões e substituições com lado e jogadores", () => {
    const { events } = detail();
    const goals = events.filter((e) => e.type === "goal" || e.type === "penalty_goal");
    expect(goals.map((g) => [g.type, g.clock, g.side, g.player, g.score])).toEqual([
      ["goal", "45'+1'", "away", "Renê", { home: 0, away: 1 }],
      ["penalty_goal", "66'", "home", "Yuri Alberto", { home: 1, away: 1 }],
    ]);
    expect(events.find((e) => e.type === "yellow_card")).toMatchObject({ clock: "53'", side: "away", player: "Renê", score: null });
    expect(events.map((e) => e.type)).toContain("kickoff");
    expect(events.map((e) => e.type)).toContain("halftime");
    expect(events.map((e) => e.type)).toContain("fulltime");
    // ruído (início do 2º tempo, paradas para hidratação) não entra
    expect(events.every((e) => e.type !== "other")).toBe(true);
  });

  it("substituição: `player` é quem sai e `secondaryPlayer` quem entra", () => {
    const sub = detail().events.find((e) => e.type === "substitution")!;
    expect(sub).toMatchObject({ clock: "67'", side: "home", player: "Vitinho", secondaryPlayer: "Kaio" });
  });

  it("eventos ficam em ordem cronológica", () => {
    const minutes = detail().events.map((e) => e.minute).filter((m): m is number => m !== null);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  it("escalações: 11 titulares na ordem da formação, goleiro primeiro, e reservas", () => {
    const { lineups } = detail();
    expect(lineups.map((l) => l.side)).toEqual(["home", "away"]);
    const home = lineups[0];
    expect(home.formation).toBe("4-2-3-1");
    expect(home.starters).toHaveLength(11);
    expect(home.bench).toHaveLength(12);
    expect(home.starters[0]).toEqual({ name: "Hugo Souza", shirtNumber: 1, position: "G", captain: false });
    expect(home.coach).toBeNull();
  });

  it("estatísticas em português, com porcentagens formatadas e precisão de passes recalculada", () => {
    const stats = Object.fromEntries(detail().statistics.map((s) => [s.key, s]));
    expect(stats.possession).toMatchObject({ label: "Posse de bola", home: 68.1, away: 31.9, homeText: "68%", awayText: "32%" });
    expect(stats.shots).toMatchObject({ home: 21, away: 5, homeText: "21" });
    expect(stats.corners).toMatchObject({ home: 9, away: 1 });
    // 562 passes certos de 637 → 88% (o `passPct` da ESPN vem 0.9, arredondado)
    expect(stats.passAccuracy).toMatchObject({ home: 88, homeText: "88%" });
  });

  it("gol contra: o lado é o do time que RECEBE o gol e o placar corrido fecha com o final", () => {
    const d = toMatchDetail(as<EspnSummary>(summaryOwnGoal), "la-liga", "esp.1", "748472")!;
    const og = d.events.find((e) => e.type === "own_goal")!;
    expect(og).toMatchObject({ side: "away", player: "Jon Gorrotxategi", score: { home: 0, away: 1 } });
    expect([d.home.score, d.away.score]).toEqual([0, 1]);
    expect(d.events.find((e) => e.type === "missed_penalty")).toMatchObject({ clock: "14'", side: "home" });
  });

  it("sem keyEvents (comum em copas menores): cai em header.details; sem nada, lista vazia", () => {
    const d = toMatchDetail(as<EspnSummary>(summaryNoKeyEvents), "copa-do-brasil", "bra.copa_do_brazil", "1")!;
    expect(d.events).toEqual([]);
    expect([d.home.penalties, d.away.penalties]).toEqual([1, 3]);
    expect(d.statistics).toEqual([]);
  });

  it("resumo vazio ou incompleto → null", () => {
    expect(toMatchDetail({}, "brasileirao-a", "bra.1", "1")).toBeNull();
    expect(toMatchDetail(null, "brasileirao-a", "bra.1", "1")).toBeNull();
  });

  it("identifica árbitro pela posição quando a ESPN informa", () => {
    const withRef = structuredClone(as<EspnSummary>(summaryFinished));
    withRef.gameInfo = { ...withRef.gameInfo, officials: [{ fullName: "Fulano Bandeira", position: { name: "Assistant Referee" } }, { fullName: "Beltrano Apito", position: { name: "Referee" } }] };
    expect(toMatchDetail(withRef, "brasileirao-a", "bra.1", "1")!.referee).toBe("Beltrano Apito");
    withRef.gameInfo!.officials = [{ fullName: "Único Árbitro" }];
    expect(toMatchDetail(withRef, "brasileirao-a", "bra.1", "1")!.referee).toBe("Único Árbitro");
    withRef.gameInfo!.officials = [{ fullName: "A" }, { fullName: "B" }];
    expect(toMatchDetail(withRef, "brasileirao-a", "bra.1", "1")!.referee).toBeNull();
  });
});

describe("eventos a partir de competition.details", () => {
  const detail = (over: Partial<EspnDetail>): EspnDetail => ({ type: { text: "x" }, clock: { value: 600, displayValue: "10'" }, team: { id: "1" }, athletesInvolved: [{ displayName: "Jogador" }], ...over });

  it("classifica pelas flags da ESPN, não pelo texto", () => {
    const events = eventsFromDetails(
      [
        detail({ scoringPlay: true }),
        detail({ scoringPlay: true, penaltyKick: true, clock: { value: 1200, displayValue: "20'" } }),
        detail({ penaltyKick: true, clock: { value: 1300, displayValue: "21'" } }),
        detail({ yellowCard: true, clock: { value: 1400, displayValue: "23'" } }),
        detail({ yellowCard: true, redCard: true, clock: { value: 1500, displayValue: "25'" } }),
        detail({ redCard: true, clock: { value: 1600, displayValue: "26'" } }),
      ],
      "1",
      "2",
    );
    expect(events.map((e) => e.type)).toEqual(["goal", "penalty_goal", "missed_penalty", "yellow_card", "second_yellow", "red_card"]);
    expect(events[1].score).toEqual({ home: 2, away: 0 });
  });

  it("pênaltis da disputa não entram no placar corrido e ficam sem minuto", () => {
    const events = eventsFromDetails(
      [detail({ scoringPlay: true }), detail({ scoringPlay: true, penaltyKick: true, shootout: true, team: { id: "2" }, clock: { value: 7000, displayValue: "" } })],
      "1",
      "2",
    );
    expect(events[1]).toMatchObject({ type: "penalty_goal", clock: "Pên.", minute: null, score: null, side: "away" });
  });

  it("time desconhecido → lado nulo; lista ausente → vazia", () => {
    expect(eventsFromDetails([detail({ team: { id: "999" }, yellowCard: true })], "1", "2")[0].side).toBeNull();
    expect(eventsFromDetails(undefined, "1", "2")).toEqual([]);
  });
});

describe("classificação", () => {
  it("Brasileirão: 20 times em ordem, números corretos e zonas do catálogo", () => {
    const s = standingsFromEspn(as<EspnStandings>(standingsBr), getLeagueDef("brasileirao-a"))!;
    expect(s.leagueId).toBe("brasileirao-a");
    expect(s.season).toBe("2026");
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].name).toBeNull();
    const rows = s.groups[0].rows;
    expect(rows).toHaveLength(20);
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(rows[0]).toMatchObject({ team: { name: "Flamengo" }, played: 31, won: 20, drawn: 7, lost: 4, goalsFor: 61, goalsAgainst: 25, goalDifference: 36, points: 67, form: null });
    expect(rows[0].won * 3 + rows[0].drawn).toBe(rows[0].points);
    expect(rows[0].zone).toMatchObject({ key: "libertadores", tone: "qualification" });
    expect(rows[19].zone).toMatchObject({ key: "relegation", tone: "relegation" });
    expect(rows[11].zone).toMatchObject({ key: "sul-americana" });
    expect(rows.find((r) => r.position === 13)!.zone).toBeNull();
  });

  it("a ESPN chama o time 3458 de 'Athletico Paranaense' na tabela e 'Athletico-PR' no placar: ambos viram o mesmo time", () => {
    const s = standingsFromEspn(as<EspnStandings>(standingsBr), getLeagueDef("brasileirao-a"))!;
    const row = s.groups[0].rows.find((r) => r.team.id === "espn:3458")!;
    expect(row.team).toMatchObject({ key: "athletico-pr", name: "Athletico-PR" });
    // o mesmo time visto pelo placar (nome já vem como "Athletico-PR")
    expect(toTeam({ id: "3458", displayName: "Athletico-PR" })).toMatchObject({ key: "athletico-pr", name: "Athletico-PR" });
    expect(toTeam({ id: "3458", displayName: "Athletico Paranaense" })).toMatchObject({ key: "athletico-pr", name: "Athletico-PR" });
  });

  it("ligas europeias: zona vem da própria ESPN (entry.note), traduzida", () => {
    const s = standingsFromEspn(as<EspnStandings>(standingsEng), getLeagueDef("premier-league"))!;
    const rows = s.groups[0].rows;
    expect(rows[0].zone).toEqual({ key: "champions-league", label: "Champions League", tone: "qualification" });
    expect(rows[4].zone).toMatchObject({ label: "Europa League", tone: "playoff" });
    expect(rows[19].zone).toMatchObject({ tone: "relegation" });
  });

  it("fase de grupos: um grupo por 'Group X', nomeado em português", () => {
    const s = standingsFromEspn(as<EspnStandings>(standingsLib), getLeagueDef("libertadores"))!;
    expect(s.groups.map((g) => g.name)).toEqual(["Grupo A", "Grupo B"]);
    expect(s.groups[0].rows[0].zone).toMatchObject({ label: "Oitavas de final", tone: "qualification" });
  });

  it("sem dados → null", () => {
    expect(standingsFromEspn({}, getLeagueDef("brasileirao-a"))).toBeNull();
    expect(standingsFromEspn({ children: [] }, getLeagueDef("brasileirao-a"))).toBeNull();
    expect(standingsFromEspn(null, getLeagueDef("brasileirao-a"))).toBeNull();
  });

  it("traduz zonas conhecidas e preserva as desconhecidas", () => {
    expect(zoneFromNote({ description: "Relegation" })).toMatchObject({ label: "Rebaixamento", tone: "relegation" });
    expect(zoneFromNote({ description: "Promotion" })).toMatchObject({ label: "Acesso", tone: "title" });
    expect(zoneFromNote({ description: "Knockout Round Playoffs" })).toEqual({ key: "knockout-round-playoffs", label: "Knockout Round Playoffs", tone: "playoff" });
    expect(zoneFromNote(null)).toBeNull();
    expect(zoneFromNote({ description: "  " })).toBeNull();
  });
});

describe("agenda do time", () => {
  it("converte jogos de várias competições, com placar em objeto, e mapeia a liga pelo slug", () => {
    const ms = matchesFromSchedule(as<EspnTeamSchedule>(teamSchedule).events);
    expect(ms.length).toBeGreaterThan(0);
    expect(new Set(ms.map((m) => m.leagueId))).toEqual(new Set(["brasileirao-a", "paulistao"]));
    const br = ms.find((m) => m.leagueId === "brasileirao-a")!;
    expect(br.status).toBe("finished");
    expect(br.home.score).not.toBeNull();
    expect(br.id).toMatch(/^espn:bra\.1:\d+$/);
  });

  it("jogos futuros vêm agendados e sem placar", () => {
    const ms = matchesFromSchedule(as<EspnTeamSchedule>(teamFixture).events);
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) {
      expect(m.status).toBe("scheduled");
      expect(m.home.score).toBeNull();
    }
  });

  it("ignora competições fora do catálogo (ex.: Supercopa)", () => {
    const [base] = as<EspnTeamSchedule>(teamSchedule).events!;
    const supercopa: EspnEvent = { ...base, league: { slug: "bra.supercopa_do_brazil" } };
    const semLiga: EspnEvent = { ...base, league: undefined };
    expect(matchesFromSchedule([supercopa, semLiga])).toEqual([]);
    expect(matchesFromSchedule(undefined)).toEqual([]);
  });
});
