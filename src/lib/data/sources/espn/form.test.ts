import { describe, expect, it } from "vitest";
import summary from "./__fixtures__/summary-upcoming-form-h2h.json";
import { formFromLastFive, headToHeadFromSeries, toMatchDetail } from "./convert";
import type { EspnLastFive, EspnSeasonSeries, EspnSummary } from "./espn-types";

const raw = summary as unknown as EspnSummary;
const detail = () => toMatchDetail(raw, "libertadores", "conmebol.libertadores", "401912521")!;

describe("forma recente (resumo real da ESPN, jogo ainda não começado)", () => {
  it("traz os dois times, cada um com os 5 jogos, do mais recente para o mais antigo", () => {
    const form = detail().form!;
    expect(form.map((f) => f.side).sort()).toEqual(["away", "home"]);
    const home = form.find((f) => f.side === "home")!;
    const away = form.find((f) => f.side === "away")!;
    expect(home.games).toHaveLength(5);
    expect(away.games).toHaveLength(5);
    expect(home.games.map((g) => g.date.slice(0, 10))).toEqual(["2026-10-18", "2026-10-16", "2026-10-11", "2026-10-08", "2026-09-20"]);
  });

  it("o resultado e os gols são do ponto de vista do time (Flamengo ganhou 3-0 fora, em Salvador)", () => {
    const home = detail().form!.find((f) => f.side === "home")!;
    expect(home.games[0]).toMatchObject({ result: "win", home: false, goalsFor: 3, goalsAgainst: 0, opponent: { name: "Bahia" } });
    expect(home.games[4]).toMatchObject({ result: "win", home: true, goalsFor: 2, goalsAgainst: 1, opponent: { name: "Red Bull Bragantino" } });
    expect(home.games[3]).toMatchObject({ result: "draw", home: false, goalsFor: 2, goalsAgainst: 2, opponent: { name: "Santos" } });
  });

  it("derrota em casa do outro time: gols a favor 1, contra 2", () => {
    const away = detail().form!.find((f) => f.side === "away")!;
    expect(away.games[0]).toMatchObject({ result: "loss", home: true, goalsFor: 1, goalsAgainst: 2, opponent: { name: "San Lorenzo" } });
  });

  it("o campo é opcional: sem forma na fonte, não existe (e não vira lista vazia)", () => {
    const { lastFiveGames: _omit, ...without } = raw;
    void _omit;
    const d = toMatchDetail(without as EspnSummary, "libertadores", "conmebol.libertadores", "401912521")!;
    expect("form" in d).toBe(false);
  });

  it("ignora time que não joga a partida, jogo sem resultado legível e placar quebrado", () => {
    const good = { id: "1", atVs: "vs", gameDate: "2026-10-18T21:00Z", homeTeamId: "819", awayTeamId: "9", homeTeamScore: "2", awayTeamScore: "0", gameResult: "W", opponent: { displayName: "Outro" } };
    const lastFive: EspnLastFive[] = [
      { team: { id: "819" }, events: [good, { ...good, id: "2", gameResult: "X" }, { ...good, id: "3", homeTeamScore: "dois" }, { ...good, id: "4", gameDate: "ontem" }, { ...good, id: "5", opponent: {} }, { ...good, id: "6", homeTeamId: "1", awayTeamId: "2" }] },
      { team: { id: "999" }, events: [good] },
    ];
    const form = formFromLastFive(lastFive, "819", "8")!;
    expect(form).toHaveLength(1);
    expect(form[0].games.map((g) => g.id)).toEqual(["1"]);
  });

  it("nada utilizável → undefined", () => {
    expect(formFromLastFive(undefined, "1", "2")).toBeUndefined();
    expect(formFromLastFive([], "1", "2")).toBeUndefined();
    expect(formFromLastFive([{ team: { id: "1" }, events: [] }], "1", "2")).toBeUndefined();
    expect(formFromLastFive([{ team: { id: "1" }, events: [{ gameResult: "W" }] }], "1", "2")).toBeUndefined();
  });

  it("limita a 5 jogos mesmo que a fonte mande mais", () => {
    const events = Array.from({ length: 8 }, (_, i) => ({ id: String(i), atVs: "vs", gameDate: `2026-10-${String(10 + i).padStart(2, "0")}T20:00Z`, homeTeamId: "1", awayTeamId: "2", homeTeamScore: "1", awayTeamScore: "0", gameResult: "W", opponent: { displayName: "X" } }));
    const form = formFromLastFive([{ team: { id: "1" }, events }], "1", "9")!;
    expect(form[0].games).toHaveLength(5);
    expect(form[0].games[0].date.slice(0, 10)).toBe("2026-10-17");
  });
});

describe("confrontos diretos (resumo real da ESPN)", () => {
  it("5 jogos encerrados, do mais recente para o mais antigo, com ids de time qualificados", () => {
    const h2h = detail().headToHead!;
    expect(h2h).toHaveLength(5);
    expect(h2h.map((g) => g.date.slice(0, 10))).toEqual(["2026-10-16", "2026-05-21", "2026-04-30", "2025-09-26", "2025-09-19"]);
    expect(h2h[0]).toMatchObject({ home: { teamId: "espn:8", name: "Estudiantes de La Plata", score: 0 }, away: { teamId: "espn:819", name: "Flamengo", score: 0 } });
    expect(h2h[1]).toMatchObject({ home: { teamId: "espn:819", score: 1 }, away: { teamId: "espn:8", score: 0 } });
  });

  it("jogo que ainda vai acontecer, sem placar ou incompleto fica de fora", () => {
    const comp = (homeAway: string, id: string, name: string, score?: string) => ({ homeAway, score, team: { id, displayName: name } });
    const series: EspnSeasonSeries[] = [
      {
        type: "head-to-head",
        events: [
          { id: "1", date: "2026-01-01T20:00Z", status: "post", competitors: [comp("home", "1", "A", "2"), comp("away", "2", "B", "1")] },
          { id: "2", date: "2026-12-01T20:00Z", status: "pre", competitors: [comp("home", "1", "A"), comp("away", "2", "B")] },
          { id: "3", date: "2026-02-01T20:00Z", status: "post", competitors: [comp("home", "1", "A", "x"), comp("away", "2", "B", "1")] },
          { id: "4", date: "2026-03-01T20:00Z", status: "post", competitors: [comp("home", "1", "A", "1")] },
          { date: "2026-04-01T20:00Z", status: "post", competitors: [comp("home", "1", "A", "1"), comp("away", "2", "B", "1")] },
          { id: "6", date: "data inválida", status: "post", competitors: [comp("home", "1", "A", "1"), comp("away", "2", "B", "1")] },
        ],
      },
    ];
    expect(headToHeadFromSeries(series)!.map((g) => g.id)).toEqual(["1"]);
  });

  it("aceita jogo encerrado marcado só por statusType.completed", () => {
    const series: EspnSeasonSeries[] = [{ type: "head-to-head", events: [{ id: "9", date: "2026-01-01T20:00Z", statusType: { completed: true }, competitors: [{ homeAway: "home", score: "1", team: { id: "1", displayName: "A" } }, { homeAway: "away", score: "1", team: { id: "2", displayName: "B" } }] }] }];
    expect(headToHeadFromSeries(series)).toHaveLength(1);
  });

  it("outros tipos de série e ausência de dados → undefined", () => {
    expect(headToHeadFromSeries(undefined)).toBeUndefined();
    expect(headToHeadFromSeries([])).toBeUndefined();
    expect(headToHeadFromSeries([{ type: "season-series", events: [] }])).toBeUndefined();
    expect(headToHeadFromSeries([{ type: "head-to-head", events: [] }])).toBeUndefined();
  });

  it("o texto pronto da ESPN, em inglês, não vaza para o nosso modelo", () => {
    expect(JSON.stringify(detail().headToHead)).not.toMatch(/leads series|Matchups/i);
  });
});
