import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DataSourceError } from "@/lib/data/errors";
import type { FetchLike } from "@/lib/data/http";
import br1 from "./__fixtures__/br1-2026.json";
import { OpenFootballClient } from "./client";
import { OpenFootballSource } from "./openfootball-source";

const txt = (n: string) => readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url), "utf8");
const JSON_BASE = "https://raw.githubusercontent.com/openfootball/football.json/master/";
const TXT_BASE = "https://raw.githubusercontent.com/openfootball/south-america/master/";

/** Arquivos que "existem" no GitHub falso; o resto responde 404, como o raw.githubusercontent. */
function setup(files: Record<string, string | Response>, now = "2026-10-05T12:00:00Z") {
  const calls: string[] = [];
  const fetchFn: FetchLike = async (url) => {
    calls.push(url);
    const f = files[url];
    return f instanceof Response ? f.clone() : f !== undefined ? new Response(f, { status: 200 }) : new Response("404: Not Found", { status: 404 });
  };
  const source = new OpenFootballSource(new OpenFootballClient({ fetch: fetchFn, timeoutMs: 1000 }), { now: () => new Date(now) });
  return { source, calls };
}

const BRASILEIRAO = { [`${JSON_BASE}2026/br.1.json`]: JSON.stringify(br1) };
const LIBERTADORES_TXT = { [`${TXT_BASE}copa-libertadores/2026_copal.txt`]: txt("copal-2026.txt") };
const fixtureOn = (date: string) => br1.matches.filter((m) => m.date === date);

describe("OpenFootballSource — jogos por data", () => {
  it("devolve os jogos do dia de Brasília, com o jogo das 21h30 incluído (00h30 em UTC)", async () => {
    const { source } = setup(BRASILEIRAO);
    const ms = await source.getMatchesByDate("2026-01-28", ["brasileirao-a"]);
    expect(ms).toHaveLength(fixtureOn("2026-01-28").length);
    expect(ms.some((m) => m.home.team.name === "São Paulo" && m.kickoff === "2026-01-29T00:30:00Z")).toBe(true);
    expect([...ms].sort((a, b) => a.kickoff.localeCompare(b.kickoff))).toEqual(ms);
  });

  it("o mesmo jogo não aparece no dia seguinte", async () => {
    const { source } = setup(BRASILEIRAO);
    const ms29 = await source.getMatchesByDate("2026-01-29", ["brasileirao-a"]);
    expect(ms29.some((m) => m.home.team.name === "São Paulo" && m.away.team.name === "Flamengo")).toBe(false);
  });

  it("escolhe o arquivo da temporada da data (ano-calendário no Brasil)", async () => {
    const { source, calls } = setup(BRASILEIRAO);
    await source.getMatchesByDate("2026-01-28", ["brasileirao-a"]);
    expect(calls).toEqual([`${JSON_BASE}2026/br.1.json`]);
  });

  it("Libertadores 2026 não tem JSON: cai no TXT do repositório south-america", async () => {
    const { source, calls } = setup(LIBERTADORES_TXT);
    const ms = await source.getMatchesByDate("2026-02-10", ["libertadores"]);
    expect(calls).toEqual([`${JSON_BASE}2026/copa.l.json`, `${TXT_BASE}copa-libertadores/2026_copal.txt`]);
    expect(ms).toHaveLength(1); // Táchira × Strongest, 21h30 BRT: já é 11/02 em UTC, mas é 10/02 em Brasília
    expect(ms[0]).toMatchObject({ leagueId: "libertadores", status: "finished", round: "1ª fase" });
    expect([ms[0].home.penalties, ms[0].away.penalties]).toEqual([5, 3]);
  });

  it("falha parcial: ligas sem arquivo (404) não derrubam as que têm", async () => {
    const { source } = setup(BRASILEIRAO); // as outras 8 ligas dão 404
    const ms = await source.getMatchesByDate("2026-01-28");
    expect(ms.length).toBe(fixtureOn("2026-01-28").length);
  });

  it("nenhum arquivo existe → erro tipado not_found", async () => {
    const { source } = setup({});
    await expect(source.getMatchesByDate("2026-01-28")).rejects.toMatchObject({ kind: "not_found", source: "openfootball" });
  });

  it("GitHub fora do ar → unavailable (o orquestrador troca de fonte)", async () => {
    const { source } = setup({ [`${JSON_BASE}2026/br.1.json`]: new Response("", { status: 503 }) });
    await expect(source.getMatchesByDate("2026-01-28", ["brasileirao-a"])).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("arquivo JSON fora do formato → bad_response", async () => {
    const { source } = setup({ [`${JSON_BASE}2026/br.1.json`]: JSON.stringify({ coisa: 1 }) });
    await expect(source.getMatchesByDate("2026-01-28", ["brasileirao-a"])).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("ligas que o openfootball não cobre → unsupported, sem chamar a rede", async () => {
    const { source, calls } = setup(BRASILEIRAO);
    await expect(source.getMatchesByDate("2026-01-28", ["champions-league"])).rejects.toMatchObject({ kind: "unsupported" });
    await expect(source.getMatchesByDate("2026-01-28", ["paulistao", "carioca"])).rejects.toMatchObject({ kind: "unsupported" });
    expect(calls).toHaveLength(0);
  });

  it("data inválida", async () => {
    const { source, calls } = setup({});
    await expect(source.getMatchesByDate("28/01/2026")).rejects.toBeInstanceOf(DataSourceError);
    expect(calls).toHaveLength(0);
  });
});

describe("OpenFootballSource — o que a fonte não tem", () => {
  it("declara as capacidades reais: sem ao vivo, eventos, escalações, estatísticas nem escudos", () => {
    const { source } = setup({});
    expect(source.capabilities).toEqual({ live: false, events: false, lineups: false, statistics: false, standings: true, crests: false });
  });

  it("jogos ao vivo → unsupported", async () => {
    const { source } = setup({});
    await expect(source.getLiveMatches()).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("cobre 9 das 14 ligas (não tem Champions nem estaduais)", () => {
    const { source } = setup({});
    expect(source.supportsLeague("brasileirao-a")).toBe(true);
    expect(source.supportsLeague("libertadores")).toBe(true);
    expect(source.supportsLeague("bundesliga")).toBe(true);
    expect(source.supportsLeague("champions-league")).toBe(false);
    expect(source.supportsLeague("paulistao")).toBe(false);
  });
});

describe("OpenFootballSource — detalhe da partida", () => {
  it("devolve só o placar; eventos, escalações, estatísticas e árbitro vazios", async () => {
    const { source } = setup(BRASILEIRAO);
    const [first] = await source.getMatchesByDate("2026-01-28", ["brasileirao-a"]);
    const d = await source.getMatch(first.id);
    expect(d.id).toBe(first.id);
    expect(d).toMatchObject({ referee: null, attendance: null, events: [], lineups: [], statistics: [] });
  });

  it("id inválido, de outra fonte, de liga desconhecida ou de jogo inexistente", async () => {
    const { source } = setup(BRASILEIRAO);
    await expect(source.getMatch("espn:bra.1:1")).rejects.toMatchObject({ kind: "invalid_id" });
    await expect(source.getMatch("openfootball:so-uma-parte")).rejects.toMatchObject({ kind: "invalid_id" });
    await expect(source.getMatch("openfootball:liga-inventada:2026:2026-01-28.a.b")).rejects.toMatchObject({ kind: "invalid_id" });
    await expect(source.getMatch("openfootball:brasileirao-a:2026:2026-01-28.nao.existe")).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("OpenFootballSource — classificação", () => {
  it("calcula a tabela da temporada atual (a data vem do relógio injetado)", async () => {
    const { source, calls } = setup(BRASILEIRAO);
    const s = await source.getStandings("brasileirao-a");
    expect(calls).toEqual([`${JSON_BASE}2026/br.1.json`]);
    expect(s).toMatchObject({ leagueId: "brasileirao-a", season: "2026" });
    expect(s.groups[0].rows).toHaveLength(20);
  });

  it("copas não têm tabela calculada → unsupported", async () => {
    const { source } = setup(LIBERTADORES_TXT);
    await expect(source.getStandings("libertadores")).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("liga fora da cobertura → unsupported", async () => {
    const { source } = setup({});
    await expect(source.getStandings("champions-league")).rejects.toMatchObject({ kind: "unsupported" });
  });
});

describe("OpenFootballSource — página do time", () => {
  const TEAM = "openfootball:red-bull-bragantino";

  it("últimos resultados, próximos jogos (só os que ainda não passaram) e posição", async () => {
    const { source } = setup(BRASILEIRAO, "2026-10-05T12:00:00Z");
    const t = await source.getTeam(TEAM, { leagueId: "brasileirao-a" });
    expect(t.team).toMatchObject({ id: TEAM, name: "Red Bull Bragantino" });
    expect(t.leagueIds).toEqual(["brasileirao-a"]);
    expect(t.recent.length).toBeGreaterThan(0);
    expect(t.recent.every((m) => m.status === "finished")).toBe(true);
    // "agora" = 5/out: o jogo de 3/out sem resultado é dado defasado (não é futuro); o de 7/out é futuro
    expect(t.upcoming.map((m) => m.kickoff.slice(0, 10))).toEqual(["2026-10-07"]);
    expect(t.standing).toMatchObject({ leagueId: "brasileirao-a", row: { team: { id: TEAM } } });
  });

  it("sem dica de liga procura nas ligas de pontos corridos", async () => {
    const { source, calls } = setup(BRASILEIRAO);
    const t = await source.getTeam("openfootball:palmeiras");
    expect(t.team.name).toBe("Palmeiras");
    expect(calls.some((c) => c.endsWith("2026/br.1.json"))).toBe(true);
    expect(calls.some((c) => c.includes("copa"))).toBe(false); // copas não entram na busca
  });

  it("time que não está em nenhum arquivo → not_found", async () => {
    const { source } = setup(BRASILEIRAO);
    await expect(source.getTeam("openfootball:time-fantasma", { leagueId: "brasileirao-a" })).rejects.toMatchObject({ kind: "not_found" });
  });

  it("id inválido", async () => {
    const { source } = setup(BRASILEIRAO);
    await expect(source.getTeam("espn:874")).rejects.toMatchObject({ kind: "invalid_id" });
    await expect(source.getTeam("openfootball:a:b")).rejects.toMatchObject({ kind: "invalid_id" });
  });
});
