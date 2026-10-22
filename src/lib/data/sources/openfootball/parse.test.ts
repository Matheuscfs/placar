import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import br1 from "./__fixtures__/br1-2026.json";
import { parseJsonScore, parseJsonSeason } from "./parse-json";
import { parseFootballTxt, parseScoreTail } from "./parse-txt";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

describe("placar no formato Football.TXT", () => {
  // Cada forma abaixo existe nos arquivos reais do openfootball.
  it.each([
    ["2-1", { ft: [2, 1] }],
    ["0-0 (0-0)", { ft: [0, 0], ht: [0, 0] }],
    ["2-1 (1-0)", { ft: [2, 1], ht: [1, 0] }],
    ["1-2 a.e.t. (1-1, 0-1)", { et: [1, 2], ft: [1, 1], ht: [0, 1] }],
    ["5-3 pen. (1-0, 1-0)", { p: [5, 3], ft: [1, 0], ht: [1, 0] }],
    ["4-3 pen. (0-0)", { p: [4, 3], ft: [0, 0] }],
    ["1-4 pen. 1-4 a.e.t. (1-1, 0-0)", { p: [1, 4], et: [1, 4], ft: [1, 1], ht: [0, 0] }],
    ["4-3 pen. 4-3 a.e.t. (0-0)", { p: [4, 3], et: [4, 3], ft: [0, 0] }],
  ])("%s", (tail, expected) => {
    expect(parseScoreTail(tail)).toEqual(expected);
  });
});

describe("parser de Football.TXT (Libertadores 2026, arquivo real)", () => {
  const season = parseFootballTxt(fixture("copal-2026.txt"), 2026);
  const find = (t1: string, t2: string) => season.matches.find((m) => m.team1.startsWith(t1) && m.team2.startsWith(t2))!;

  it("lê o título e todos os jogos com times definidos", () => {
    expect(season.name).toBe("Copa Libertadores 2026");
    expect(season.matches).toHaveLength(53);
  });

  it("primeiro jogo: data completa, hora, times, placar e 1º tempo", () => {
    expect(season.matches[0]).toEqual({
      round: "Qualifying, Round 1",
      date: "2026-02-03",
      time: "21:30",
      team1: "Club The Strongest (BOL)",
      team2: "Deportivo Táchira FC (VEN)",
      score: { ft: [2, 1], ht: [0, 0] },
      group: null,
    });
  });

  it("datas sem ano herdam o ano; a hora omitida repete a da linha anterior", () => {
    expect(find("Club The Strongest", "Deportivo T").date).toBe("2026-02-03");
    expect(find("2 de Mayo", "Club Alianza").date).toBe("2026-02-04"); // "Wed Feb 4"
    expect(find("2 de Mayo (PAR)", "CS Cristal").time).toBe("21:30"); // sem hora na linha: vale a do jogo acima
    expect(find("Carabobo", "CD Huachipato").time).toBe("19:00");
  });

  it("disputa de pênaltis", () => {
    expect(find("Deportivo Táchira", "Club The Strongest").score).toEqual({ p: [5, 3], ft: [1, 0], ht: [1, 0] });
  });

  it("jogos sem resultado ficam com score nulo", () => {
    const playoffs = season.matches.filter((m) => m.round === "Playoffs, Matchday 1");
    expect(playoffs).toHaveLength(16);
    expect(playoffs.every((m) => m.score === null)).toBe(true);
  });

  it("descarta jogos com time indefinido (N.N.)", () => {
    expect(season.matches.some((m) => /N\.N/.test(m.team1 + m.team2))).toBe(false);
    expect(season.matches.some((m) => m.round.startsWith("Finals"))).toBe(false);
  });

  it("nomes de times com dígitos e parênteses não confundem o placar", () => {
    expect(find("2 de Mayo", "Club Alianza").team1).toBe("2 de Mayo (PAR)");
    expect(find("2 de Mayo", "Club Alianza").score).toEqual({ ft: [1, 0], ht: [0, 0] });
  });
});

describe("parser de Football.TXT (Copa do Brasil 2025, arquivo real)", () => {
  it("prorrogação seguida de pênaltis, com o placar repetido como o arquivo traz", () => {
    const season = parseFootballTxt(fixture("brcup-2025.txt"), 2025);
    const m = season.matches.find((x) => x.team1.startsWith("São Raimundo"))!;
    expect(m.score).toEqual({ p: [1, 4], et: [1, 4], ft: [1, 1], ht: [0, 0] });
    expect(season.matches.filter((x) => x.score?.et)).toHaveLength(4);
  });
});

describe("parser de Football.TXT (casos de borda; texto escrito à mão no formato do arquivo)", () => {
  it("virada de ano: meses que voltam atrás avançam o ano", () => {
    const s = parseFootballTxt(["= Liga", "▪ Matchday 1", "  Sat Dec 19 2026", "    20:00  A v B  1-0", "  Sat Jan 9", "    20:00  C v D  2-2"].join("\n"), 2026);
    expect(s.matches.map((m) => m.date)).toEqual(["2026-12-19", "2027-01-09"]);
  });

  it("sem ano na primeira data usa o ano informado", () => {
    const s = parseFootballTxt(["▪ Matchday 1", "  Wed Mar 4", "    20:00  A v B  1-0"].join("\n"), 2030);
    expect(s.matches[0].date).toBe("2030-03-04");
  });

  it("cabeçalho 'Group A' vira o grupo do jogo", () => {
    const s = parseFootballTxt(["▪ Group A", "  Tue Mar 3 2026", "    19:00  A v B  1-0", "▪ Group B", "  Tue Mar 3", "    19:00  C v D  0-0"].join("\n"), 2026);
    expect(s.matches.map((m) => m.group)).toEqual(["A", "B"]);
  });

  it("ignora comentários, linhas em branco, lixo e jogos antes de qualquer data", () => {
    const s = parseFootballTxt(["# comentário", "", "    19:00  X v Y  1-0", "texto solto", "▪ R", "  Tue Mar 3 2026", "    19:00  A v B"].join("\n"), 2026);
    expect(s.matches).toHaveLength(1);
    expect(s.matches[0]).toMatchObject({ team1: "A", team2: "B", score: null });
  });

  it("o horário não vaza de um dia para o outro", () => {
    const s = parseFootballTxt(["▪ R", "  Tue Mar 3 2026", "    19:00  A v B  1-0", "  Wed Mar 4", "           C v D  1-0"].join("\n"), 2026);
    expect(s.matches[1].time).toBeNull();
  });

  it("texto vazio → nenhum jogo, sem lançar", () => {
    expect(parseFootballTxt("", 2026)).toEqual({ name: "", matches: [] });
  });
});

describe("parser do JSON do football.json", () => {
  it("aceita as duas formas de placar", () => {
    expect(parseJsonScore([2, 1])).toEqual({ ft: [2, 1] });
    expect(parseJsonScore({ ft: [1, 1], ht: [0, 1], p: [4, 3] })).toEqual({ ft: [1, 1], ht: [0, 1], p: [4, 3] });
    expect(parseJsonScore({ ft: ["1", "x"] })).toBeNull();
    expect(parseJsonScore({})).toBeNull();
    expect(parseJsonScore(undefined)).toBeNull();
    expect(parseJsonScore("1-0")).toBeNull();
  });

  it("lê o Brasileirão 2026 (arquivo real): rodadas, horários e jogos sem resultado", () => {
    const s = parseJsonSeason(br1)!;
    expect(s.name).toBe("Brasileiro Série A 2026");
    expect(s.matches).toHaveLength(35);
    expect(s.matches[0]).toMatchObject({ round: "Matchday 1", date: "2026-01-28", time: "19:00", team1: "CA Mineiro", team2: "SE Palmeiras", score: { ft: [2, 2], ht: [1, 1] } });
    expect(s.matches.filter((m) => m.score === null)).toHaveLength(4);
    expect(s.matches.find((m) => m.date === "2026-07-29")!.time).toBeNull(); // jogo sem horário no arquivo
  });

  it("descarta jogos malformados e rejeita arquivos fora do formato", () => {
    const s = parseJsonSeason({
      name: "X",
      matches: [
        { date: "2026-01-01", team1: "A", team2: "B", time: "9:00", round: "Matchday 1" },
        { date: "01/01/2026", team1: "A", team2: "B" },
        { date: "2026-01-02", team1: "A" },
        { date: "2026-01-03", team1: "", team2: "B" },
        null,
        "lixo",
      ],
    })!;
    expect(s.matches).toHaveLength(1);
    expect(s.matches[0].time).toBe("09:00");
    expect(parseJsonSeason({ matches: "não é lista" })).toBeNull();
    expect(parseJsonSeason(null)).toBeNull();
    expect(parseJsonSeason([])).toBeNull();
  });
});
