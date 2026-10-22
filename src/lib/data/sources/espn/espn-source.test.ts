import { describe, expect, it } from "vitest";
import { DataSourceError } from "@/lib/data/errors";
import { toZonedIsoDate } from "@/lib/domain/dates";
import { LEAGUES } from "@/lib/domain/leagues";
import scheduledDay from "./__fixtures__/scoreboard-bra1-scheduled.json";
import feedDay from "./__fixtures__/feed-2026-10-24.json";
import feedLive from "./__fixtures__/feed-live.json";
import summaryFinished from "./__fixtures__/summary-bra1-finished.json";
import standingsBr from "./__fixtures__/standings-bra1.json";
import teamSchedule from "./__fixtures__/team-schedule-all.json";
import teamFixture from "./__fixtures__/team-schedule-fixture.json";
import { EspnClient, type FetchLike } from "./client";
import { EspnSource } from "./espn-source";
import type { EspnScoreboard } from "./espn-types";

type Route = (url: URL) => Response | Promise<Response> | undefined;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Fonte ESPN com um `fetch` falso: cada rota responde com fixtures reais, e toda chamada fica registrada. */
function setup(...routes: Route[]) {
  const calls: string[] = [];
  const fetchFn: FetchLike = async (input) => {
    calls.push(input);
    const url = new URL(input);
    for (const r of routes) {
      const res = await r(url);
      if (res) return res;
    }
    return json({ events: [] });
  };
  return { source: new EspnSource(new EspnClient({ fetch: fetchFn, timeoutMs: 1000 })), calls };
}

const scoreboardOf = (slug: string, body: unknown): Route => (u) => (u.pathname === `/apis/site/v2/sports/soccer/${slug}/scoreboard` ? json(body) : undefined);
const feedOf = (body: unknown): Route => (u) => (u.pathname === "/apis/site/v2/sports/soccer/all/scoreboard" ? json(body) : undefined);

const OUR_ESPN_IDS = new Set(LEAGUES.flatMap((l) => (l.sources.espnLeagueId ? [l.sources.espnLeagueId] : [])));
const leagueIdOf = (e: { uid?: string }) => /~l:(\d+)~/.exec(e.uid ?? "")?.[1] ?? "";
const feedEvents = (feedDay as unknown as EspnScoreboard).events ?? [];

describe("EspnSource — lista de jogos (feed global)", () => {
  it("UMA única chamada traz todas as ligas, com data e limite no formato da ESPN", async () => {
    const { source, calls } = setup(feedOf(feedDay));
    await source.getMatchesByDate("2026-10-24");
    expect(calls).toEqual(["https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?limit=1000&dates=20261024"]);
  });

  it("pedir só algumas ligas continua sendo uma chamada, e só elas voltam", async () => {
    const { source, calls } = setup(feedOf(feedDay));
    const ms = await source.getMatchesByDate("2026-10-24", ["brasileirao-a"]);
    expect(calls).toHaveLength(1);
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => m.leagueId === "brasileirao-a")).toBe(true);
  });

  it("traz as ligas do catálogo e descarta as de fora", async () => {
    // O feed real mistura o mundo todo. O catálogo cresce com o tempo, então não dependemos de quais ligas a
    // ESPN tinha naquele dia: juntamos à fixture um jogo de uma liga que NÃO está no catálogo (id 99999).
    const stranger = { ...feedEvents[0], id: "999999", uid: "s:600~l:99999~e:999999" };
    expect(OUR_ESPN_IDS.has("99999")).toBe(false);
    const { source } = setup(feedOf({ ...(feedDay as object), events: [...feedEvents, stranger] }));
    const ms = await source.getMatchesByDate("2026-10-24");
    const esperados = feedEvents.filter((e) => OUR_ESPN_IDS.has(leagueIdOf(e)) && toZonedIsoDate(e.date!) === "2026-10-24");
    expect(ms).toHaveLength(esperados.length);
    expect(ms.some((m) => m.id.endsWith(":999999"))).toBe(false);
    expect(ms.length).toBeGreaterThan(10);
    expect(new Set(ms.map((m) => m.leagueId)).size).toBeGreaterThan(1);
  });

  it("cada jogo sai com a liga, o id e a fonte certos", async () => {
    const { source } = setup(feedOf(feedDay));
    const serieA = (await source.getMatchesByDate("2026-10-24", ["brasileirao-a"]))[0];
    expect(serieA).toMatchObject({ source: "espn", leagueId: "brasileirao-a", status: "scheduled" });
    expect(serieA.id).toMatch(/^espn:bra\.1:\d+$/);
  });

  it("ordenado por horário", async () => {
    const { source } = setup(feedOf(feedDay));
    const ms = await source.getMatchesByDate("2026-10-24");
    expect([...ms].sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))).toEqual(ms);
  });

  it("só fica o que é do dia de Brasília pedido (o feed agrupa por dia dos EUA)", async () => {
    const { source } = setup(feedOf(feedDay));
    for (const date of ["2026-10-23", "2026-10-24", "2026-10-25"]) {
      const ms = await source.getMatchesByDate(date);
      expect(ms.every((m) => toZonedIsoDate(m.kickoff) === date), date).toBe(true);
    }
  });

  it("feed no teto de 1000 jogos pode estar incompleto: cai para a consulta liga a liga", async () => {
    const cheio = { events: Array.from({ length: 1000 }, () => feedEvents[0]) };
    const { source, calls } = setup(feedOf(cheio), scoreboardOf("bra.1", scheduledDay));
    const ms = await source.getMatchesByDate("2026-10-24", ["brasileirao-a", "libertadores"]);
    expect(calls).toHaveLength(3); // o feed + uma consulta por liga pedida
    expect(calls.some((c) => c.includes("/bra.1/scoreboard?dates=20261024"))).toBe(true);
    expect(calls.some((c) => c.includes("/conmebol.libertadores/scoreboard?dates=20261024"))).toBe(true);
    expect(ms.filter((m) => m.leagueId === "brasileirao-a")).toHaveLength(3);
  });

  it("falha do feed: propaga o erro tipado para o orquestrador acionar o fallback", async () => {
    const { source } = setup(() => new Response("fora do ar", { status: 503 }));
    await expect(source.getMatchesByDate("2026-10-24")).rejects.toMatchObject({ name: "DataSourceError", kind: "unavailable", source: "espn" });
  });

  it("resposta sem a lista de jogos → vazio, sem quebrar", async () => {
    const { source } = setup(() => json({}));
    expect(await source.getMatchesByDate("2026-10-24")).toEqual([]);
  });

  it("rejeita data inválida sem chamar a rede", async () => {
    const { source, calls } = setup();
    await expect(source.getMatchesByDate("24/10/2026")).rejects.toBeInstanceOf(DataSourceError);
    expect(calls).toHaveLength(0);
  });
});

describe("EspnSource — ao vivo", () => {
  /**
   * Jogos em andamento REAIS capturados em 22/10/2026 (ligas fora do catálogo: Grécia, Arábia…).
   * Para o conector reconhecê-los, o único ajuste é trocar o id da liga no `uid` pelo do Brasileirão.
   */
  const asBrasileirao = (board: unknown) => {
    const b = structuredClone(board) as unknown as EspnScoreboard;
    for (const e of b.events ?? []) e.uid = e.uid?.replace(/~l:\d+~/, "~l:630~");
    return b;
  };
  const inProgress = ((feedLive as unknown as EspnScoreboard).events ?? []).filter((e) => e.status?.type?.state === "in");

  it("a fixture tem jogos de verdade em andamento", () => {
    expect(inProgress.length).toBeGreaterThan(0);
  });

  it("consulta o feed SEM `dates` (janela atual) e devolve só os jogos em andamento", async () => {
    const { source, calls } = setup(feedOf(asBrasileirao(feedLive)));
    const ms = await source.getLiveMatches();
    expect(calls).toEqual(["https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?limit=1000"]);
    expect(ms).toHaveLength(inProgress.length);
    for (const m of ms) {
      expect(["live", "halftime"]).toContain(m.status);
      expect(m.home.score).not.toBeNull();
      if (m.status === "live") expect(m.clock).toMatch(/^\d+'/);
    }
  });

  it("jogos de ligas fora do catálogo não aparecem (o feed é do mundo todo)", async () => {
    // Troca o id da liga de todos os eventos por um que não está no catálogo.
    const board = structuredClone(feedLive) as unknown as EspnScoreboard;
    for (const e of board.events ?? []) e.uid = e.uid?.replace(/~l:\d+~/, "~l:99999~");
    const { source } = setup(feedOf(board));
    expect(await source.getLiveMatches()).toEqual([]);
  });

  it("sem jogos ao vivo → lista vazia (não é erro)", async () => {
    const { source } = setup(feedOf(feedDay));
    expect(await source.getLiveMatches()).toEqual([]);
  });
});

describe("EspnSource — detalhe, tabela e time", () => {
  it("getMatch busca o summary da liga certa a partir do id", async () => {
    const { source, calls } = setup((u) => (u.pathname.endsWith("/bra.1/summary") ? json(summaryFinished) : undefined));
    const d = await source.getMatch("espn:bra.1:401841272");
    expect(calls).toEqual(["https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary?event=401841272"]);
    expect(d.events.length).toBeGreaterThan(0);
    expect(d.lineups).toHaveLength(2);
  });

  it("getMatch rejeita ids de outra fonte, malformados ou de liga fora do catálogo", async () => {
    const { source, calls } = setup();
    await expect(source.getMatch("openfootball:abc")).rejects.toMatchObject({ kind: "invalid_id" });
    await expect(source.getMatch("espn:bra.1")).rejects.toMatchObject({ kind: "invalid_id" });
    await expect(source.getMatch("lixo")).rejects.toMatchObject({ kind: "invalid_id" });
    await expect(source.getMatch("espn:bra.supercopa_do_brazil:1")).rejects.toMatchObject({ kind: "unsupported" });
    expect(calls).toHaveLength(0);
  });

  it("getMatch: resumo incompleto → bad_response", async () => {
    const { source } = setup(() => json({}));
    await expect(source.getMatch("espn:bra.1:1")).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("getStandings usa o endpoint v2 de classificação", async () => {
    const { source, calls } = setup((u) => (u.pathname.endsWith("/bra.1/standings") ? json(standingsBr) : undefined));
    const s = await source.getStandings("brasileirao-a");
    expect(calls[0]).toBe("https://site.api.espn.com/apis/v2/sports/soccer/bra.1/standings");
    expect(s.groups[0].rows).toHaveLength(20);
  });

  it("getStandings: sem tabela → not_found", async () => {
    const { source } = setup(() => json({ children: [] }));
    await expect(source.getStandings("copa-do-brasil")).rejects.toMatchObject({ kind: "not_found" });
  });

  const teamRoutes: Route[] = [
    (u) => (u.pathname.endsWith("/teams/874/schedule") ? json(u.searchParams.has("fixture") ? teamFixture : teamSchedule) : undefined),
    (u) => (u.pathname.endsWith("/bra.1/standings") ? json(standingsBr) : undefined),
  ];

  it("getTeam: últimos resultados (mais recente primeiro), próximos jogos e posição na tabela", async () => {
    const { source, calls } = setup(...teamRoutes);
    const t = await source.getTeam("espn:874");
    expect(calls[0]).toContain("/soccer/all/teams/874/schedule");
    expect(calls.some((c) => c.includes("fixture=true"))).toBe(true);
    expect(t.team).toMatchObject({ id: "espn:874", name: "Corinthians", abbr: "COR" });
    expect(t.recent.length).toBeGreaterThan(0);
    expect(t.recent.every((m) => m.status === "finished")).toBe(true);
    expect(t.recent.map((m) => m.kickoff)).toEqual([...t.recent.map((m) => m.kickoff)].sort().reverse());
    expect(t.upcoming.length).toBeGreaterThan(0);
    expect(t.upcoming.map((m) => m.kickoff)).toEqual([...t.upcoming.map((m) => m.kickoff)].sort());
    expect(t.leagueIds).toContain("brasileirao-a");
    // a liga "atual" é a do próximo jogo (Brasileirão), não a que tem mais jogos no histórico
    expect(t.standing?.leagueId).toBe("brasileirao-a");
    expect(t.standing?.row.team.id).toBe("espn:874");
    expect(t.standing?.row.position).toBeGreaterThan(0);
  });

  it("getTeam com liga informada restringe a consulta a ela", async () => {
    const { source, calls } = setup(
      (u) => (u.pathname.includes("/bra.1/teams/874/schedule") ? json(u.searchParams.has("fixture") ? teamFixture : teamSchedule) : undefined),
      ...teamRoutes,
    );
    await source.getTeam("espn:874", { leagueId: "brasileirao-a" });
    expect(calls[0]).toContain("/soccer/bra.1/teams/874/schedule");
  });

  it("getTeam sobrevive à falha da agenda futura e da tabela", async () => {
    const { source } = setup(
      (u) => (u.pathname.endsWith("/teams/874/schedule") ? (u.searchParams.has("fixture") ? new Response("x", { status: 500 }) : json(teamSchedule)) : undefined),
      (u) => (u.pathname.endsWith("/standings") ? new Response("x", { status: 500 }) : undefined),
    );
    const t = await source.getTeam("espn:874");
    expect(t.recent.length).toBeGreaterThan(0);
    expect(t.upcoming).toEqual([]);
    expect(t.standing).toBeNull();
  });

  it("getTeam: time inexistente → not_found; id inválido → invalid_id", async () => {
    const { source } = setup(() => json({ events: [] }));
    await expect(source.getTeam("espn:999")).rejects.toMatchObject({ kind: "not_found" });
    await expect(source.getTeam("espn:bra.1:999")).rejects.toMatchObject({ kind: "invalid_id" });
  });
});

describe("EspnSource — metadados", () => {
  it("declara capacidades e cobre todas as ligas do catálogo", async () => {
    const { source } = setup();
    expect(source.id).toBe("espn");
    expect(source.capabilities).toEqual({ live: true, events: true, lineups: true, statistics: true, standings: true, crests: true });
    expect(LEAGUES.every((l) => source.supportsLeague(l.id))).toBe(true);
    expect((await source.getLeagues()).map((l) => l.id)).toEqual([...LEAGUES].sort((a, b) => a.order - b.order).map((l) => l.id));
  });
});

describe("EspnClient — tradução de erros", () => {
  const clientWith = (fetchFn: FetchLike) => new EspnClient({ fetch: fetchFn, timeoutMs: 50 });
  const kindOf = async (fetchFn: FetchLike) => {
    try {
      await clientWith(fetchFn).scoreboard("bra.1", "20261024");
      return "ok";
    } catch (e) {
      return (e as DataSourceError).kind;
    }
  };

  it("mapeia status HTTP para o tipo de erro certo", async () => {
    expect(await kindOf(async () => new Response("", { status: 429 }))).toBe("rate_limited");
    expect(await kindOf(async () => new Response("", { status: 404 }))).toBe("not_found");
    expect(await kindOf(async () => new Response("", { status: 500 }))).toBe("unavailable");
    expect(await kindOf(async () => new Response("", { status: 403 }))).toBe("unavailable");
    // a ESPN responde 400 a consultas que ela não aceita (ex.: intervalo de datas)
    expect(await kindOf(async () => new Response("", { status: 400 }))).toBe("bad_response");
  });

  it("corpo que não é JSON → bad_response", async () => {
    expect(await kindOf(async () => new Response("<html>oops</html>", { status: 200 }))).toBe("bad_response");
  });

  it("falha de rede → unavailable; estouro de tempo → timeout", async () => {
    expect(await kindOf(async () => Promise.reject(new TypeError("fetch failed")))).toBe("unavailable");
    expect(await kindOf(async () => Promise.reject(new DOMException("timeout", "TimeoutError")))).toBe("timeout");
  });

  it("de verdade: uma resposta mais lenta que o limite dispara timeout", async () => {
    const slow: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    expect(await kindOf(slow)).toBe("timeout");
  });

  it("erros carregam a fonte e o status", async () => {
    await expect(clientWith(async () => new Response("", { status: 429 })).scoreboard("bra.1")).rejects.toMatchObject({ source: "espn", status: 429 });
  });
});
