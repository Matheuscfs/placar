import { describe, expect, it } from "vitest";
import type { FormGame, MatchDetail, MatchStatus, MeetingGame } from "@/lib/domain/types";
import { formatCountdown, formSummary, headToHeadRecord, matchAbout, matchTitle } from "./match-text";

const team = (id: string, name: string) => ({ id: `espn:${id}`, key: name.toLowerCase(), name, shortName: name, abbr: name.slice(0, 3).toUpperCase() });

function detail(over: Partial<MatchDetail> & { status?: MatchStatus; hs?: number | null; as?: number | null } = {}): MatchDetail {
  const { hs = null, as = null, ...rest } = over;
  return {
    id: "espn:x:1",
    source: "espn",
    leagueId: "libertadores",
    season: "2026",
    round: "Semifinal",
    kickoff: "2026-10-23T00:30:00Z", // 21:30 de 22/10 em Brasília
    status: "scheduled",
    statusText: null,
    clock: null,
    home: { team: team("819", "Flamengo"), score: hs, penalties: null, aggregate: null },
    away: { team: team("8", "Estudiantes de La Plata"), score: as, penalties: null, aggregate: null },
    venue: "Maracanã",
    referee: "Gustavo Tejera",
    attendance: null,
    events: [],
    lineups: [],
    statistics: [],
    ...rest,
  };
}

describe("matchAbout", () => {
  it("jogo marcado: data e hora de Brasília, local, competição, fase e árbitro", () => {
    expect(matchAbout(detail(), "CONMEBOL Libertadores")).toBe(
      "Flamengo e Estudiantes de La Plata se enfrentam em 22/10/2026, às 21h30 (horário de Brasília), em Maracanã, em partida válida por CONMEBOL Libertadores (Semifinal). Arbitragem: Gustavo Tejera.",
    );
  });

  it("hora cheia sai sem minutos; sem local, sem fase e sem árbitro, a frase não deixa buraco", () => {
    const t = matchAbout(detail({ kickoff: "2026-10-23T22:00:00Z", venue: null, round: null, referee: null }), "Premier League");
    expect(t).toBe("Flamengo e Estudiantes de La Plata se enfrentam em 23/10/2026, às 19h (horário de Brasília), em partida válida por Premier League.");
    expect(t).not.toMatch(/undefined|null|,\s*\./);
  });

  it("a data é a de Brasília, não a de UTC (02:00Z ainda é o dia anterior)", () => {
    expect(matchAbout(detail({ kickoff: "2026-10-24T02:00:00Z" }), "X")).toContain("em 23/10/2026, às 23h");
  });

  it("sem nome de competição: usa só a fase, ou nada", () => {
    expect(matchAbout(detail(), null)).toContain("válida pela fase Semifinal");
    expect(matchAbout(detail({ round: null }), null)).not.toContain("válida");
  });

  it("ao vivo e intervalo: placar atual", () => {
    expect(matchAbout(detail({ status: "live", hs: 1, as: 0 }), "Liga")).toContain("jogam agora");
    expect(matchAbout(detail({ status: "halftime", hs: 1, as: 0 }), "Liga")).toContain("Placar: Flamengo 1 x 0 Estudiantes de La Plata.");
    expect(matchAbout(detail({ status: "live" }), "Liga")).not.toContain("Placar:");
  });

  it("encerrado: 'Terminou A 2 x 1 B' (sem artigos que dependem do gênero) e pênaltis quando houve", () => {
    const t = matchAbout(detail({ status: "finished", hs: 2, as: 1 }), "Liga");
    expect(t).toContain("Terminou Flamengo 2 x 1 Estudiantes de La Plata em 22/10/2026");
    const pens = detail({ status: "finished", hs: 1, as: 1 });
    pens.home.penalties = 4;
    pens.away.penalties = 3;
    expect(matchAbout(pens, "Liga")).toContain("Nos pênaltis: 4 x 3.");
    expect(matchAbout(detail({ status: "finished" }), "Liga")).toContain("jogaram em 22/10/2026");
  });

  it("adiado, suspenso e cancelado dizem isso", () => {
    expect(matchAbout(detail({ status: "postponed" }), "Liga X")).toBe("A partida entre Flamengo e Estudiantes de La Plata, válida por Liga X (Semifinal), marcada para 22/10/2026, foi adiada.");
    expect(matchAbout(detail({ status: "suspended" }), "Liga X")).toContain("foi suspensa.");
    expect(matchAbout(detail({ status: "canceled" }), "Liga X")).toContain("que seria em 22/10/2026, foi cancelada.");
  });
});

describe("matchTitle", () => {
  it("antes do jogo: onde assistir, horário e escalações", () => {
    expect(matchTitle(detail())).toBe("Flamengo x Estudiantes de La Plata: onde assistir, horário e escalações");
  });
  it("ao vivo e encerrado", () => {
    expect(matchTitle(detail({ status: "live", hs: 1, as: 0 }))).toBe("Flamengo x Estudiantes de La Plata ao vivo: placar, lances e escalações");
    expect(matchTitle(detail({ status: "finished", hs: 2, as: 1 }))).toBe("Flamengo 2 x 1 Estudiantes de La Plata: resultado, gols e estatísticas");
  });
  it("encerrado sem placar (dado ruim) não inventa número", () => {
    expect(matchTitle(detail({ status: "finished" }))).toBe("Flamengo x Estudiantes de La Plata: onde assistir, horário e escalações");
  });
});

describe("formatCountdown", () => {
  const MIN = 60_000;
  it("faixas: instantes, minutos, horas (com ou sem minutos) e dias", () => {
    expect(formatCountdown(30_000)).toBe("Começa em instantes");
    expect(formatCountdown(MIN)).toBe("Começa em instantes");
    expect(formatCountdown(MIN + 1)).toBe("Começa em 2 min");
    expect(formatCountdown(45 * MIN)).toBe("Começa em 45 min");
    expect(formatCountdown(59 * MIN + 1)).toBe("Começa em 1 h");
    expect(formatCountdown(60 * MIN)).toBe("Começa em 1 h");
    expect(formatCountdown(3 * 60 * MIN + 45 * MIN)).toBe("Começa em 3 h 45 min");
    expect(formatCountdown(23 * 60 * MIN + 59 * MIN)).toBe("Começa em 23 h 59 min");
    expect(formatCountdown(24 * 60 * MIN)).toBe("Começa em 1 dia");
    expect(formatCountdown(49 * 60 * MIN)).toBe("Começa em 2 dias");
  });
  it("hora passada: null (a tela mostra o status normal)", () => {
    expect(formatCountdown(0)).toBeNull();
    expect(formatCountdown(-5000)).toBeNull();
  });
});

describe("headToHeadRecord", () => {
  const g = (id: string, hid: string, hs: number, aid: string, as: number): MeetingGame => ({ id, date: "2026-01-01T00:00:00Z", home: { teamId: hid, name: hid, score: hs }, away: { teamId: aid, name: aid, score: as } });
  it("conta do ponto de vista dos times de AGORA, mesmo que antes eles tenham trocado de lado", () => {
    const games = [g("1", "espn:8", 0, "espn:819", 0), g("2", "espn:819", 1, "espn:8", 0), g("3", "espn:8", 1, "espn:819", 1), g("4", "espn:8", 1, "espn:819", 0), g("5", "espn:819", 2, "espn:8", 1)];
    expect(headToHeadRecord(games, "espn:819", "espn:8")).toEqual({ homeWins: 2, draws: 2, awayWins: 1 });
    expect(headToHeadRecord(games, "espn:8", "espn:819")).toEqual({ homeWins: 1, draws: 2, awayWins: 2 });
  });
  it("ignora jogos de outros times e lista vazia", () => {
    expect(headToHeadRecord([g("1", "espn:1", 3, "espn:2", 0)], "espn:819", "espn:8")).toEqual({ homeWins: 0, draws: 0, awayWins: 0 });
    expect(headToHeadRecord([], "espn:819", "espn:8")).toEqual({ homeWins: 0, draws: 0, awayWins: 0 });
  });
});

describe("formSummary", () => {
  const f = (result: FormGame["result"]): FormGame => ({ id: Math.random().toString(), date: "2026-01-01T00:00:00Z", result, home: true, opponent: { name: "X" }, goalsFor: 1, goalsAgainst: 0 });
  it("diz as quantidades por extenso, com singular e 'nenhuma'", () => {
    expect(formSummary([f("win"), f("win"), f("win"), f("draw"), f("draw")])).toBe("3 vitórias, 2 empates, nenhuma derrota");
    expect(formSummary([f("loss")])).toBe("nenhuma vitória, nenhum empate, 1 derrota");
    expect(formSummary([f("draw"), f("win")])).toBe("1 vitória, 1 empate, nenhuma derrota");
    expect(formSummary([])).toBe("nenhuma vitória, nenhum empate, nenhuma derrota");
  });
});
