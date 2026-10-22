import { describe, expect, it } from "vitest";
import { DataSourceError } from "@/lib/data/errors";
import { addDays, isIsoDate, isOnDate, toZonedIsoDate, zonedTimeToUtc } from "./dates";
import { makeId, parseId } from "./ids";
import { LEAGUES, findLeagueBySourceCode, getLeagueDef, leaguesForSource, zoneFor } from "./leagues";
import { TEAM_ALIASES } from "./team-aliases";
import { normalizeTeamKey, teamDisplayName } from "./team-key";
import { LEAGUE_IDS } from "./types";

describe("ids qualificados", () => {
  it("monta e interpreta ids", () => {
    const id = makeId("espn", "bra.1", 748392);
    expect(id).toBe("espn:bra.1:748392");
    expect(parseId(id)).toEqual({ source: "espn", parts: ["bra.1", "748392"] });
  });

  it("rejeita ids malformados com erro invalid_id", () => {
    for (const bad of ["", "espn", "espn:", "outra:1", "espn::2"]) {
      expect(() => parseId(bad), bad).toThrow(DataSourceError);
    }
    try {
      parseId("outra:1");
    } catch (e) {
      expect((e as DataSourceError).kind).toBe("invalid_id");
      expect((e as DataSourceError).retryableWithFallback).toBe(false);
    }
  });

  it("não deixa ':' vazar para dentro de uma parte", () => {
    expect(() => makeId("espn", "a:b")).toThrow();
    expect(() => makeId("espn", "")).toThrow();
    expect(() => makeId("espn")).toThrow();
  });
});

describe("chave estável de time", () => {
  it("iguala o nome do openfootball ao da ESPN", () => {
    expect(normalizeTeamKey("SE Palmeiras")).toBe("palmeiras");
    expect(normalizeTeamKey("Palmeiras")).toBe("palmeiras");
    expect(normalizeTeamKey("CR Flamengo")).toBe("flamengo");
    expect(normalizeTeamKey("São Paulo FC")).toBe("sao-paulo");
    expect(normalizeTeamKey("Monagas SC (VEN)")).toBe("monagas");
    expect(normalizeTeamKey("Defensor SC (URU)")).toBe("defensor");
  });

  it("mantém sufixos de estado que distinguem times", () => {
    expect(normalizeTeamKey("Atlético-MG")).toBe("atletico-mg");
    expect(normalizeTeamKey("Atlético-GO")).toBe("atletico-go");
  });

  it("nunca devolve chave vazia para nomes só com siglas", () => {
    expect(normalizeTeamKey("FC")).toBe("fc");
  });
});

describe("datas no fuso do app", () => {
  it("valida datas de calendário", () => {
    expect(isIsoDate("2026-10-22")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("22/10/2026")).toBe(false);
  });

  it("jogo às 21h30 BRT em 22/10 (00:30Z de 23/10) pertence ao dia 22", () => {
    expect(toZonedIsoDate("2026-10-23T00:30:00Z")).toBe("2026-10-22");
    expect(isOnDate("2026-10-23T00:30:00Z", "2026-10-22")).toBe(true);
    expect(isOnDate("2026-10-23T00:30:00Z", "2026-10-23")).toBe(false);
  });

  it("virada de dia: 02:59Z ainda é o dia anterior em Brasília, 03:00Z já é o novo", () => {
    expect(toZonedIsoDate("2026-10-23T02:59:59Z")).toBe("2026-10-22");
    expect(toZonedIsoDate("2026-10-23T03:00:00Z")).toBe("2026-10-23");
  });

  it("soma dias atravessando mês e ano", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("catálogo de ligas", () => {
  it("tem exatamente uma definição por id conhecido, sem duplicatas", () => {
    expect(LEAGUES.map((l) => l.id).sort()).toEqual([...LEAGUE_IDS].sort());
    expect(new Set(LEAGUES.map((l) => l.order)).size).toBe(LEAGUES.length);
  });

  it("toda liga é coberta por ao menos uma fonte", () => {
    for (const l of LEAGUES) expect(Object.keys(l.sources).length, l.id).toBeGreaterThan(0);
  });

  it("zonas ficam dentro da tabela e não se sobrepõem", () => {
    for (const l of LEAGUES) {
      const sorted = [...l.zones].sort((a, b) => a.from - b.from);
      sorted.forEach((z, i) => {
        expect(z.from, `${l.id}/${z.key}`).toBeLessThanOrEqual(z.to);
        if (i > 0) expect(z.from, `${l.id}/${z.key}`).toBeGreaterThan(sorted[i - 1].to);
      });
    }
  });

  it("resolve zona por posição", () => {
    const br = getLeagueDef("brasileirao-a");
    expect(zoneFor(br, 1)?.key).toBe("libertadores");
    expect(zoneFor(br, 4)?.key).toBe("libertadores");
    expect(zoneFor(br, 5)?.key).toBe("libertadores-q");
    expect(zoneFor(br, 13)).toBeNull();
    expect(zoneFor(br, 17)?.tone).toBe("relegation");
    expect(zoneFor(br, 20)?.tone).toBe("relegation");
  });

  it("mapeia códigos das fontes para ligas internas", () => {
    expect(findLeagueBySourceCode("espn", "bra.1")?.id).toBe("brasileirao-a");
    expect(findLeagueBySourceCode("espn", "conmebol.libertadores")?.id).toBe("libertadores");
    expect(findLeagueBySourceCode("football-data", "BSA")?.id).toBe("brasileirao-a");
    expect(findLeagueBySourceCode("espn", "nao.existe")).toBeUndefined();
  });

  it("football-data só cobre Série A e as ligas europeias do plano grátis", () => {
    expect(leaguesForSource("football-data").map((l) => l.id)).toEqual([
      "brasileirao-a",
      "premier-league",
      "la-liga",
      "serie-a-italia",
      "bundesliga",
      "champions-league",
    ]);
  });

  it("a ESPN cobre todas as ligas do app", () => {
    expect(leaguesForSource("espn")).toHaveLength(LEAGUES.length);
  });
});

describe("horário local → UTC", () => {
  it("Brasília (UTC-3, sem horário de verão)", () => {
    expect(zonedTimeToUtc("2026-10-22", "21:30", "America/Sao_Paulo")).toBe("2026-10-23T00:30:00Z");
    expect(zonedTimeToUtc("2026-01-28", "19:00", "America/Sao_Paulo")).toBe("2026-01-28T22:00:00Z");
  });

  it("Londres respeita o horário de verão", () => {
    expect(zonedTimeToUtc("2026-08-21", "20:00", "Europe/London")).toBe("2026-08-21T19:00:00Z");
    expect(zonedTimeToUtc("2027-01-09", "15:00", "Europe/London")).toBe("2027-01-09T15:00:00Z");
  });

  it("Europa continental: UTC+2 no verão, UTC+1 no inverno", () => {
    expect(zonedTimeToUtc("2026-08-22", "20:30", "Europe/Madrid")).toBe("2026-08-22T18:30:00Z");
    expect(zonedTimeToUtc("2027-01-10", "20:30", "Europe/Berlin")).toBe("2027-01-10T19:30:00Z");
  });

  it("é a inversa de toZonedIsoDate", () => {
    const utc = zonedTimeToUtc("2026-03-15", "23:45", "America/Sao_Paulo");
    expect(toZonedIsoDate(utc)).toBe("2026-03-15");
  });

  it("rejeita datas e horas impossíveis em vez de rolar para outro dia", () => {
    expect(() => zonedTimeToUtc("2026-13-45", "20:00", "America/Sao_Paulo")).toThrow(RangeError);
    expect(() => zonedTimeToUtc("2026-02-30", "20:00", "America/Sao_Paulo")).toThrow(RangeError);
    expect(() => zonedTimeToUtc("2026-03-01", "25:00", "America/Sao_Paulo")).toThrow(RangeError);
    expect(() => zonedTimeToUtc("2026-03-01", "20:75", "America/Sao_Paulo")).toThrow(RangeError);
    expect(() => zonedTimeToUtc("2026-03-01", "tarde", "America/Sao_Paulo")).toThrow(RangeError);
  });
});

describe("aliases de times", () => {
  it("nomes do openfootball e da ESPN chegam à mesma chave", () => {
    const pares: Array<[string, string]> = [
      ["CA Mineiro", "Atlético-MG"],
      ["CA Paranaense", "Athletico-PR"],
      ["RB Bragantino", "Red Bull Bragantino"],
      ["Clube do Remo", "Remo"],
      ["SC Corinthians Paulista (BRA)", "Corinthians"],
      ["FC Bayern München", "Bayern Munich"],
      ["1. FC Köln", "FC Cologne"],
      ["Club Atlético de Madrid", "Atlético Madrid"],
      ["FC Internazionale Milano", "Internazionale"],
      ["CDP Junior FC (COL)", "Atlético Junior"],
      ["Athletico Paranaense", "Athletico-PR"], // a própria ESPN usa os dois nomes
    ];
    for (const [a, b] of pares) expect(normalizeTeamKey(a), `${a} × ${b}`).toBe(normalizeTeamKey(b));
  });

  it("nome de exibição: alias usa o canônico; os demais perdem só as siglas das pontas", () => {
    expect(teamDisplayName("CA Mineiro")).toBe("Atlético-MG");
    expect(teamDisplayName("SE Palmeiras")).toBe("Palmeiras");
    expect(teamDisplayName("São Paulo FC")).toBe("São Paulo");
    expect(teamDisplayName("Club The Strongest (BOL)")).toBe("The Strongest");
    expect(teamDisplayName("Vasco da Gama")).toBe("Vasco da Gama");
  });

  it("alias não pode apontar para outro alias nem para a própria origem (evita ciclos)", () => {
    for (const [from, to] of Object.entries(TEAM_ALIASES)) {
      expect(from, from).not.toBe(to.key);
      expect(TEAM_ALIASES[to.key], `${from} → ${to.key}`).toBeUndefined();
    }
  });
});
