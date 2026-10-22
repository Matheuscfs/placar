import { describe, expect, it } from "vitest";
import { getLeagueDef } from "@/lib/domain/leagues";
import type { Match } from "@/lib/domain/types";
import br1 from "./__fixtures__/br1-2026.json";
import en1 from "./__fixtures__/en1-2026-27.json";
import { deriveAbbr, fillPath, gameScore, matchesFromSeason, roundLabelOf, seasonLabelFor, standingsFromMatches, toMatch, toTeam } from "./convert";
import type { OfMatch } from "./of-types";
import { parseJsonSeason } from "./parse-json";

const BRT = "America/Sao_Paulo";
const brA = getLeagueDef("brasileirao-a");
const premier = getLeagueDef("premier-league");
const brCtx = { league: brA, season: "2026", timeZone: BRT };

const of = (over: Partial<OfMatch> = {}): OfMatch => ({ round: "Matchday 1", date: "2026-03-01", time: "20:00", team1: "SE Palmeiras", team2: "CR Flamengo", score: null, group: null, ...over });

describe("temporada e caminho do arquivo", () => {
  it("Brasil usa o ano-calendário", () => {
    expect(seasonLabelFor(brA, "2026-01-28")).toBe("2026");
    expect(seasonLabelFor(brA, "2026-12-02")).toBe("2026");
  });

  it("Europa: a temporada começa em julho", () => {
    expect(seasonLabelFor(premier, "2026-10-22")).toBe("2026-27");
    expect(seasonLabelFor(premier, "2027-03-01")).toBe("2026-27");
    expect(seasonLabelFor(premier, "2026-07-01")).toBe("2026-27");
    expect(seasonLabelFor(premier, "2026-06-30")).toBe("2025-26");
  });

  it("preenche {year} e {season}", () => {
    expect(fillPath("{year}/br.1.json", "2026")).toBe("2026/br.1.json");
    expect(fillPath("{season}/en.1.json", "2026-27")).toBe("2026-27/en.1.json");
    expect(fillPath("brazil/{year}_br1.txt", "2026")).toBe("brazil/2026_br1.txt");
  });
});

describe("rodada em português", () => {
  it.each([
    ["Matchday 12", "Rodada 12"],
    ["Group, Matchday 2", "Fase de grupos · Rodada 2"],
    ["Group A", "Grupo A"],
    ["Qualifying, Round 2", "2ª fase"],
    ["Round 3", "3ª fase"],
    ["Playoffs, Matchday 1", "Oitavas de final · Ida"],
    ["Playoffs, Matchday 2", "Oitavas de final · Volta"],
    ["Round of 16", "Oitavas de final"],
    ["Finals, Quarterfinals", "Quartas de final"],
    ["Finals, Semifinals", "Semifinal"],
    ["Finals, Final", "Final"],
    ["Preliminary round", "Fase preliminar"],
    ["Fase Misteriosa", "Fase Misteriosa"], // desconhecida: mantém o original
    ["", null],
  ])("%s → %s", (raw, expected) => {
    expect(roundLabelOf(raw)).toBe(expected);
  });
});

describe("placar do jogo", () => {
  it("só tempo regulamentar", () => expect(gameScore({ ft: [2, 1], ht: [1, 0] })).toEqual({ game: [2, 1], penalties: null }));
  it("sem resultado → null", () => {
    expect(gameScore(null)).toBeNull();
    expect(gameScore({ ht: [0, 0] })).toBeNull();
  });
  it("prorrogação vale mais que o tempo regulamentar", () => expect(gameScore({ ft: [1, 1], et: [1, 2] })).toEqual({ game: [1, 2], penalties: null }));
  it("pênaltis: o jogo fica com o tempo regulamentar e os pênaltis à parte", () => {
    expect(gameScore({ ft: [1, 0], p: [5, 3] })).toEqual({ game: [1, 0], penalties: [5, 3] });
  });
  it("prorrogação + pênaltis com placares diferentes: jogo = prorrogação", () => {
    expect(gameScore({ ft: [1, 1], et: [2, 2], p: [4, 3] })).toEqual({ game: [2, 2], penalties: [4, 3] });
  });
  it("o arquivo repete os pênaltis como prorrogação ('1-4 pen. 1-4 a.e.t.'): vale o tempo regulamentar", () => {
    expect(gameScore({ ft: [1, 1], et: [1, 4], p: [1, 4] })).toEqual({ game: [1, 1], penalties: [1, 4] });
  });
});

describe("time", () => {
  it("nome amigável, chave canônica e id qualificado", () => {
    expect(toTeam("SE Palmeiras")).toEqual({ id: "openfootball:palmeiras", key: "palmeiras", name: "Palmeiras", shortName: "Palmeiras", abbr: "PAL" });
  });

  it("alias leva ao time canônico da ESPN", () => {
    expect(toTeam("CA Mineiro")).toMatchObject({ id: "openfootball:atletico-mg", key: "atletico-mg", name: "Atlético-MG" });
    expect(toTeam("SC Corinthians Paulista (BRA)")).toMatchObject({ key: "corinthians", name: "Corinthians" });
    expect(toTeam("FC Bayern München")).toMatchObject({ key: "bayern-munich", name: "Bayern Munich" });
  });

  it("não tem escudo nem cor (o openfootball não fornece)", () => {
    const t = toTeam("SE Palmeiras");
    expect(t.logo).toBeUndefined();
    expect(t.color).toBeUndefined();
  });

  it("sigla de 3 letras sem acento", () => {
    expect(deriveAbbr("São Paulo")).toBe("SAO");
    expect(deriveAbbr("Grêmio")).toBe("GRE");
    expect(deriveAbbr("")).toBe("");
  });
});

describe("partida", () => {
  it("jogo com resultado: encerrado, horário de Brasília convertido para UTC, rodada em português", () => {
    const m = toMatch(of({ date: "2026-01-28", time: "19:00", team1: "CA Mineiro", team2: "SE Palmeiras", score: { ft: [2, 2], ht: [1, 1] } }), brCtx)!;
    expect(m).toMatchObject({
      id: "openfootball:brasileirao-a:2026:2026-01-28.atletico-mg.palmeiras",
      source: "openfootball",
      leagueId: "brasileirao-a",
      season: "2026",
      round: "Rodada 1",
      kickoff: "2026-01-28T22:00:00Z",
      status: "finished",
      statusText: "Encerrado",
      clock: null,
      venue: null,
    });
    expect([m.home.score, m.away.score]).toEqual([2, 2]);
    expect([m.home.team.name, m.away.team.name]).toEqual(["Atlético-MG", "Palmeiras"]);
  });

  it("jogo às 21:30 em Brasília cai no dia seguinte em UTC, mas continua no mesmo dia local", () => {
    const m = toMatch(of({ date: "2026-01-28", time: "21:30" }), brCtx)!;
    expect(m.kickoff).toBe("2026-01-29T00:30:00Z");
  });

  it("jogo sem resultado: agendado, sem placar", () => {
    const m = toMatch(of(), brCtx)!;
    expect(m).toMatchObject({ status: "scheduled", statusText: null });
    expect([m.home.score, m.away.score]).toEqual([null, null]);
  });

  it("jogo sem horário usa 12:00 local", () => {
    expect(toMatch(of({ time: null, date: "2026-07-29" }), brCtx)!.kickoff).toBe("2026-07-29T15:00:00Z");
  });

  it("pênaltis e prorrogação aparecem no texto de status", () => {
    const pen = toMatch(of({ score: { ft: [1, 0], p: [5, 3] } }), brCtx)!;
    expect(pen.statusText).toBe("Encerrado (pênaltis)");
    expect([pen.home.penalties, pen.away.penalties]).toEqual([5, 3]);
    expect(toMatch(of({ score: { ft: [1, 1], et: [1, 2] } }), brCtx)!.statusText).toBe("Encerrado (prorrogação)");
  });

  it("o fuso é o do campeonato: Premier League em Londres (horário de verão = UTC+1)", () => {
    const m = toMatch(of({ date: "2026-08-21", time: "20:00", team1: "Arsenal FC", team2: "Coventry City FC" }), { league: premier, season: "2026-27", timeZone: "Europe/London" })!;
    expect(m.kickoff).toBe("2026-08-21T19:00:00Z");
    expect(m.home.team.name).toBe("Arsenal");
  });

  it("no inverno de Londres o fuso é UTC+0", () => {
    const m = toMatch(of({ date: "2027-01-09", time: "15:00" }), { league: premier, season: "2026-27", timeZone: "Europe/London" })!;
    expect(m.kickoff).toBe("2027-01-09T15:00:00Z");
  });

  it("descarta jogo com times iguais ou data impossível", () => {
    expect(toMatch(of({ team1: "SE Palmeiras", team2: "Palmeiras" }), brCtx)).toBeNull();
    expect(toMatch(of({ date: "2026-13-45" }), brCtx)).toBeNull();
  });

  it("ids são únicos e estáveis dentro de uma temporada real", () => {
    const season = parseJsonSeason(br1)!;
    const ms = matchesFromSeason(season.matches, brCtx);
    expect(ms).toHaveLength(35);
    expect(new Set(ms.map((m) => m.id)).size).toBe(35);
    expect(matchesFromSeason(season.matches, brCtx).map((m) => m.id)).toEqual(ms.map((m) => m.id));
  });

  it("temporada europeia real (Londres): horários convertidos e nomes limpos", () => {
    const ms = matchesFromSeason(parseJsonSeason(en1)!.matches, { league: premier, season: "2026-27", timeZone: "Europe/London" });
    expect(ms[0]).toMatchObject({ kickoff: "2026-08-21T19:00:00Z" });
    expect(ms[0].home.team.name).toBe("Arsenal");
    expect(ms[1].home.team.name).toBe("Hull City");
  });
});

describe("classificação calculada", () => {
  const ms = matchesFromSeason(parseJsonSeason(br1)!.matches, brCtx);
  const table = standingsFromMatches(ms, brA, "2026");
  const rows = table.groups[0].rows;

  it("tem os 20 times, em posições contíguas, mesmo os sem jogo disputado", () => {
    expect(table).toMatchObject({ leagueId: "brasileirao-a", season: "2026" });
    expect(table.groups).toHaveLength(1);
    expect(table.groups[0].name).toBeNull();
    expect(rows).toHaveLength(20);
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("os números fecham: pontos = 3V + E, jogos = V + E + D, e gols marcados = sofridos no total", () => {
    for (const r of rows) {
      expect(r.points).toBe(r.won * 3 + r.drawn);
      expect(r.played).toBe(r.won + r.drawn + r.lost);
      expect(r.goalDifference).toBe(r.goalsFor - r.goalsAgainst);
    }
    expect(rows.reduce((s, r) => s + r.goalsFor, 0)).toBe(rows.reduce((s, r) => s + r.goalsAgainst, 0));
    expect(rows.reduce((s, r) => s + r.won, 0)).toBe(rows.reduce((s, r) => s + r.lost, 0)); // toda vitória é a derrota de alguém
    // cada jogo encerrado conta uma vez para cada lado
    expect(rows.reduce((s, r) => s + r.played, 0)).toBe(2 * ms.filter((m) => m.status === "finished").length);
  });

  it("ordenada por pontos (e, no Brasil, vitórias) e com zonas do catálogo", () => {
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].points).toBeGreaterThanOrEqual(rows[i].points);
    expect(rows[0].zone).toMatchObject({ key: "libertadores" });
    expect(rows[19].zone).toMatchObject({ key: "relegation" });
  });

  it("forma: V/E/D do mais antigo ao mais recente; sem jogo = nulo", () => {
    const pal = rows.find((r) => r.team.key === "palmeiras")!;
    // rodadas 1-3 reais: 2-2 (E), 5-1 (V), 1-3 como visitante (V) → "EVV"
    expect(pal.form).toBe("EVV");
    expect(rows.every((r) => r.form === null || /^[VED]{1,5}$/.test(r.form))).toBe(true);
    const semJogo = standingsFromMatches([toMatch(of(), brCtx)!], brA, "2026").groups[0].rows;
    expect(semJogo.every((r) => r.form === null && r.played === 0 && r.points === 0)).toBe(true);
  });

  describe("critérios de desempate (jogos construídos à mão)", () => {
    const g = (home: string, away: string, hg: number, ag: number, day: number) =>
      toMatch(of({ team1: home, team2: away, date: `2026-03-${String(day).padStart(2, "0")}`, score: { ft: [hg, ag] } }), brCtx)!;
    // E: 1 vitória e 2 derrotas por 0-3 (3 pts, saldo -5). F: 3 empates (3 pts, saldo 0).
    const games: Match[] = [
      g("Time E", "Z1", 1, 0, 1), g("Time E", "Z2", 0, 3, 2), g("Time E", "Z3", 0, 3, 3),
      g("Time F", "Y1", 0, 0, 1), g("Time F", "Y2", 1, 1, 2), g("Time F", "Y3", 2, 2, 3),
    ];
    const pos = (t: ReturnType<typeof standingsFromMatches>, name: string) => t.groups[0].rows.find((r) => r.team.name === name)!.position;

    it("Brasil: com os mesmos pontos, mais vitórias vêm antes do saldo de gols", () => {
      const t = standingsFromMatches(games, brA, "2026");
      expect(pos(t, "Time E")).toBeLessThan(pos(t, "Time F"));
    });

    it("Europa: com os mesmos pontos, o saldo de gols decide", () => {
      const t = standingsFromMatches(games, premier, "2026-27");
      expect(pos(t, "Time F")).toBeLessThan(pos(t, "Time E"));
    });

    it("forma usa só os 5 últimos jogos", () => {
      const results: Array<[number, number]> = [[0, 1], [1, 0], [2, 0], [1, 0], [3, 1], [1, 0]]; // D V V V V V
      const seq = results.map(([hg, ag], i) => g("Time G", `W${i + 1}`, hg, ag, i + 1));
      const t = standingsFromMatches(seq, brA, "2026");
      expect(t.groups[0].rows.find((r) => r.team.name === "Time G")!.form).toBe("VVVVV");
    });
  });
});
