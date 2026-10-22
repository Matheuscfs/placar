import { describe, expect, it } from "vitest";
import type { FetchLike } from "@/lib/data/http";
import { LEAGUES } from "@/lib/domain/leagues";
// Fixtures escritas a partir da documentação (não são respostas reais): ver __fixtures__/LEIA-ME.md
import matchDetail from "./__fixtures__/match-detail.json";
import matchesList from "./__fixtures__/matches-list.json";
import standingsBsa from "./__fixtures__/standings-bsa.json";
import teamFinished from "./__fixtures__/team-matches-finished.json";
import teamScheduled from "./__fixtures__/team-matches-scheduled.json";
import { FootballDataClient } from "./client";
import { FootballDataSource } from "./football-data-source";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
type Route = (url: URL) => Response | undefined;

function setup(routes: Route[] = [], opts: { token?: string } = {}) {
  const calls: Array<{ url: URL; headers: Record<string, string> }> = [];
  const fetchFn: FetchLike = async (input, init) => {
    const url = new URL(input);
    calls.push({ url, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)) });
    for (const r of routes) {
      const res = r(url);
      if (res) return res;
    }
    return json({ matches: [] });
  };
  const client = new FootballDataClient({ token: opts.token ?? "token-de-teste", fetch: fetchFn, timeoutMs: 1000 });
  return { source: new FootballDataSource(client), client, calls };
}

const at = (path: string, body: unknown): Route => (u) => (u.pathname === `/v4${path}` ? json(body) : undefined);

describe("FootballDataSource — lista de jogos", () => {
  it("uma chamada para todas as ligas, com o token no cabeçalho e as competições no filtro", async () => {
    const { source, calls } = setup([at("/matches", matchesList)]);
    await source.getMatchesByDate("2026-10-21");
    expect(calls).toHaveLength(1);
    expect(calls[0].headers["X-Auth-Token"]).toBe("token-de-teste");
    expect(calls[0].url.searchParams.get("competitions")).toBe("BSA,PL,PD,SA,BL1,CL");
    // o dia de Brasília atravessa duas datas UTC: pede o dia e o seguinte
    expect(calls[0].url.searchParams.get("dateFrom")).toBe("2026-10-21");
    expect(calls[0].url.searchParams.get("dateTo")).toBe("2026-10-22");
  });

  it("filtra por liga e ignora parâmetros vazios", async () => {
    const { source, calls } = setup([at("/matches", matchesList)]);
    await source.getMatchesByDate("2026-10-21", ["brasileirao-a"]);
    expect(calls[0].url.searchParams.get("competitions")).toBe("BSA");
  });

  it("mantém só o dia de Brasília: 00h30Z de 22/10 ainda é 21/10 às 21h30", async () => {
    const { source } = setup([at("/matches", matchesList)]);
    const ms = await source.getMatchesByDate("2026-10-21");
    expect(ms.map((m) => m.id)).toEqual(["football-data:1006", "football-data:1005", "football-data:1002", "football-data:1003", "football-data:1011"]);
    const dia22 = await source.getMatchesByDate("2026-10-22");
    expect(dia22).toEqual([]);
  });

  it("ligas fora do plano (Brasileirão B, Libertadores, estaduais…) → unsupported, sem rede", async () => {
    const { source, calls } = setup();
    await expect(source.getMatchesByDate("2026-10-21", ["libertadores"])).rejects.toMatchObject({ kind: "unsupported" });
    await expect(source.getMatchesByDate("2026-10-21", ["brasileirao-b", "paulistao"])).rejects.toMatchObject({ kind: "unsupported" });
    expect(calls).toHaveLength(0);
  });

  it("data inválida", async () => {
    const { source, calls } = setup();
    await expect(source.getMatchesByDate("21/10/2026")).rejects.toMatchObject({ kind: "invalid_id" });
    expect(calls).toHaveLength(0);
  });
});

describe("FootballDataSource — sem token", () => {
  it("não cobre nenhuma liga e nunca chama a rede (o orquestrador a ignora)", async () => {
    const { source, calls } = setup([], { token: "" });
    expect(LEAGUES.some((l) => source.supportsLeague(l.id))).toBe(false);
    expect(await source.getLeagues()).toEqual([]);
    await expect(source.getMatchesByDate("2026-10-21")).rejects.toMatchObject({ kind: "unsupported" });
    await expect(source.getStandings("brasileirao-a")).rejects.toMatchObject({ kind: "unsupported" });
    expect(calls).toHaveLength(0);
  });

  it("token só com espaços também conta como ausente", () => {
    expect(setup([], { token: "   " }).client.hasToken).toBe(false);
  });
});

describe("FootballDataSource — capacidades e cobertura", () => {
  it("o plano grátis tem placar atrasado e nada de eventos/escalações/estatísticas", () => {
    const { source } = setup();
    expect(source.capabilities).toEqual({ live: false, delayedLive: true, events: false, lineups: false, statistics: false, standings: true, crests: true });
  });

  it("com token cobre Brasileirão A e as 5 ligas europeias do catálogo", async () => {
    const { source } = setup();
    expect((await source.getLeagues()).map((l) => l.id)).toEqual(["brasileirao-a", "premier-league", "la-liga", "serie-a-italia", "bundesliga", "champions-league"]);
    expect(source.supportsLeague("brasileirao-a")).toBe(true);
    expect(source.supportsLeague("libertadores")).toBe(false);
    expect(source.supportsLeague("copa-do-brasil")).toBe(false);
  });
});

describe("FootballDataSource — ao vivo", () => {
  it("pede status=LIVE e devolve só o que está em andamento (inclui intervalo e prorrogação)", async () => {
    const { source, calls } = setup([at("/matches", matchesList)]);
    const ms = await source.getLiveMatches(["brasileirao-a"]);
    expect(calls[0].url.searchParams.get("status")).toBe("LIVE");
    expect(calls[0].url.searchParams.get("competitions")).toBe("BSA");
    expect(ms.map((m) => m.id).sort()).toEqual(["football-data:1002", "football-data:1003", "football-data:1011"]);
  });
});

describe("FootballDataSource — detalhe, tabela e time", () => {
  it("getMatch busca /matches/{id} e devolve eventos e escalações quando o plano os dá", async () => {
    const { source, calls } = setup([at("/matches/1001", matchDetail)]);
    const d = await source.getMatch("football-data:1001");
    expect(calls[0].url.pathname).toBe("/v4/matches/1001");
    expect(d.events.length).toBe(6);
    expect(d.lineups).toHaveLength(2);
    expect(d.referee).toBe("Árbitro Principal");
  });

  it("getMatch: ids inválidos não chegam à rede; competição fora do catálogo → unsupported; resposta incompleta → bad_response", async () => {
    const { source, calls } = setup([at("/matches/7", { ...matchDetail, competition: { code: "ELC" } }), at("/matches/8", {})]);
    for (const bad of ["espn:1", "football-data:abc", "football-data:1:2", "lixo"]) await expect(source.getMatch(bad), bad).rejects.toMatchObject({ kind: "invalid_id" });
    expect(calls).toHaveLength(0);
    await expect(source.getMatch("football-data:7")).rejects.toMatchObject({ kind: "unsupported" });
    await expect(source.getMatch("football-data:8")).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("getStandings usa o código da competição", async () => {
    const { source, calls } = setup([at("/competitions/BSA/standings", standingsBsa)]);
    const s = await source.getStandings("brasileirao-a");
    expect(calls[0].url.pathname).toBe("/v4/competitions/BSA/standings");
    expect(s.groups[0].rows).toHaveLength(20);
  });

  it("getStandings: liga fora do plano → unsupported sem rede; tabela vazia → not_found", async () => {
    const { source, calls } = setup([at("/competitions/BSA/standings", { standings: [] })]);
    await expect(source.getStandings("libertadores")).rejects.toMatchObject({ kind: "unsupported" });
    expect(calls).toHaveLength(0);
    await expect(source.getStandings("brasileirao-a")).rejects.toMatchObject({ kind: "not_found" });
  });

  const teamRoutes: Route[] = [
    (u) => (u.pathname === "/v4/teams/1779/matches" ? json(u.searchParams.get("status") === "FINISHED" ? teamFinished : teamScheduled) : undefined),
    at("/competitions/BSA/standings", standingsBsa),
  ];

  it("getTeam: últimos resultados (mais recente primeiro), próximos jogos e posição na tabela", async () => {
    const { source, calls } = setup(teamRoutes);
    const t = await source.getTeam("football-data:1779");
    const statuses = calls.filter((c) => c.url.pathname.endsWith("/matches")).map((c) => c.url.searchParams.get("status")).sort();
    expect(statuses).toEqual(["FINISHED", "SCHEDULED,TIMED"]);
    expect(t.team).toMatchObject({ id: "football-data:1779", name: "Corinthians", abbr: "COR" });
    expect(t.recent.map((m) => m.id)).toEqual(["football-data:903", "football-data:902", "football-data:901"]);
    expect(t.upcoming.map((m) => m.id)).toEqual(["football-data:904", "football-data:905"]);
    expect(t.leagueIds).toEqual(["brasileirao-a"]);
    expect(t.standing).toMatchObject({ leagueId: "brasileirao-a", row: { position: 10, team: { id: "football-data:1779" } } });
  });

  it("getTeam sobrevive à falha dos jogos futuros e da tabela", async () => {
    const { source } = setup([
      (u) => (u.pathname === "/v4/teams/1779/matches" ? (u.searchParams.get("status") === "FINISHED" ? json(teamFinished) : new Response("x", { status: 500 })) : undefined),
      (u) => (u.pathname.endsWith("/standings") ? new Response("x", { status: 500 }) : undefined),
    ]);
    const t = await source.getTeam("football-data:1779");
    expect(t.recent).toHaveLength(3);
    expect(t.upcoming).toEqual([]);
    expect(t.standing).toBeNull();
  });

  it("getTeam: time sem jogos → not_found; ids inválidos → invalid_id", async () => {
    const { source } = setup();
    await expect(source.getTeam("football-data:99999")).rejects.toMatchObject({ kind: "not_found" });
    await expect(source.getTeam("espn:874")).rejects.toMatchObject({ kind: "invalid_id" });
    await expect(source.getTeam("football-data:abc")).rejects.toMatchObject({ kind: "invalid_id" });
  });
});

describe("FootballDataClient — tradução de erros", () => {
  const kindOf = async (status: number) => {
    const { source } = setup([() => new Response("", { status })]);
    try {
      await source.getMatchesByDate("2026-10-21");
      return "ok";
    } catch (e) {
      return (e as { kind: string }).kind;
    }
  };

  it("403 (recurso fora do plano) é `unsupported`, NÃO pane da fonte", async () => {
    expect(await kindOf(403)).toBe("unsupported");
  });

  it("429, 401, 5xx e 400", async () => {
    expect(await kindOf(429)).toBe("rate_limited");
    expect(await kindOf(401)).toBe("unavailable"); // token recusado: configuração quebrada, tem de aparecer como falha
    expect(await kindOf(500)).toBe("unavailable");
    expect(await kindOf(400)).toBe("bad_response");
  });

  it("estouro de tempo e falha de rede", async () => {
    const timeout = new FootballDataClient({ token: "t", fetch: async () => Promise.reject(new DOMException("t", "TimeoutError")) });
    await expect(new FootballDataSource(timeout).getMatchesByDate("2026-10-21")).rejects.toMatchObject({ kind: "timeout", source: "football-data" });
    const down = new FootballDataClient({ token: "t", fetch: async () => Promise.reject(new TypeError("fetch failed")) });
    await expect(new FootballDataSource(down).getMatchesByDate("2026-10-21")).rejects.toMatchObject({ kind: "unavailable" });
  });
});
