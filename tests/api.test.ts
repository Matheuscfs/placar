import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getLeagues } from "@/app/api/leagues/route";
import { GET as getLive } from "@/app/api/live/route";
import { GET as getMatch } from "@/app/api/matches/[id]/route";
import { GET as getMatches } from "@/app/api/matches/route";
import { GET as getStandings } from "@/app/api/standings/[leagueId]/route";
import { GET as getStatus } from "@/app/api/status/route";
import { GET as getTeam } from "@/app/api/teams/[id]/route";
import { cacheControl, parseDateParam, parseIdParam, parseLeaguesParam } from "@/lib/api/http";
import type { DataSource } from "@/lib/data/data-source";
import { DataSourceError } from "@/lib/data/errors";
import { Orchestrator } from "@/lib/data/orchestrator";
import { setOrchestratorForTests } from "@/lib/data/registry";
import { addDays, todayIso } from "@/lib/domain/dates";
import { LEAGUE_IDS, type LeagueId, type Match, type MatchDetail, type SourceId } from "@/lib/domain/types";

const today = () => todayIso();
const req = (path: string, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, { headers });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

function mkMatch(source: SourceId, leagueId: LeagueId, over: Partial<Match> = {}): Match {
  const team = (s: string) => ({ id: `${source}:${s}`, key: s, name: s, shortName: s, abbr: "TTT" });
  return {
    id: `${source}:${leagueId}:1`,
    source,
    leagueId,
    season: "2026",
    round: null,
    kickoff: `${today()}T23:00:00Z`,
    status: "scheduled",
    statusText: null,
    clock: null,
    home: { team: team("h"), score: null, penalties: null, aggregate: null },
    away: { team: team("a"), score: null, penalties: null, aggregate: null },
    venue: null,
    ...over,
  };
}

interface Behavior {
  matches?: (leagues: LeagueId[]) => Match[];
  live?: (leagues: LeagueId[]) => Match[];
  match?: (id: string) => MatchDetail;
  fail?: DataSourceError | Error;
}

function source(id: SourceId, b: Behavior = {}): DataSource {
  const boom = () => {
    if (b.fail) throw b.fail;
  };
  return {
    id,
    capabilities: { live: true, events: true, lineups: true, statistics: true, standings: true, crests: true },
    supportsLeague: () => true,
    getLeagues: async () => [],
    // O orquestrador pede o dia INTEIRO da fonte (sem filtro de ligas) e recorta depois.
    getMatchesByDate: async (_d, ls) => (boom(), b.matches ? b.matches(ls ?? [...LEAGUE_IDS]) : (ls ?? [...LEAGUE_IDS]).map((l) => mkMatch(id, l))),
    getLiveMatches: async (ls) => (boom(), b.live ? b.live(ls ?? []) : []),
    getMatch: async (matchId) => (boom(), b.match ? b.match(matchId) : { ...mkMatch(id, "brasileirao-a", { id: matchId }), referee: null, attendance: null, events: [], lineups: [], statistics: [] }),
    getStandings: async (l) => (boom(), { leagueId: l, season: "2026", groups: [{ name: null, rows: [] }] }),
    getTeam: async (teamId, q) => (boom(), { team: { id: teamId, key: "t", name: "T", shortName: "T", abbr: "TTT" }, leagueIds: q?.leagueId ? [q.leagueId] : [], upcoming: [], recent: [], standing: null }),
  };
}

const install = (...sources: DataSource[]) => setOrchestratorForTests(new Orchestrator({ sources }));

beforeEach(() => install(source("espn")));
afterEach(() => {
  setOrchestratorForTests(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("parâmetros", () => {
  const now = new Date("2026-10-22T15:00:00Z"); // 22/10 em Brasília

  it("data: padrão é hoje; formato inválido → 400", () => {
    expect(parseDateParam(null, now)).toBe("2026-10-22");
    expect(parseDateParam("", now)).toBe("2026-10-22");
    expect(parseDateParam("2026-10-25", now)).toBe("2026-10-25");
    for (const bad of ["22/10/2026", "2026-13-01", "2026-02-30", "ontem", "2026-10-22T10:00"]) expect(() => parseDateParam(bad, now), bad).toThrow(/Data inválida/);
  });

  it("data: janela de 60 dias atrás a 120 à frente, com as bordas incluídas", () => {
    expect(parseDateParam(addDays("2026-10-22", -60), now)).toBe("2026-08-23");
    expect(parseDateParam(addDays("2026-10-22", 120), now)).toBe("2027-02-19");
    expect(() => parseDateParam(addDays("2026-10-22", -61), now)).toThrow(/fora do intervalo/);
    expect(() => parseDateParam(addDays("2026-10-22", 121), now)).toThrow(/fora do intervalo/);
  });

  it("'hoje' usa o dia de Brasília: 02:00Z de 23/10 ainda é 22/10", () => {
    expect(parseDateParam(null, new Date("2026-10-23T02:00:00Z"))).toBe("2026-10-22");
  });

  it("ligas: vírgulas, espaços e repetições; desconhecida → 400; vazio → todas", () => {
    expect(parseLeaguesParam(null)).toBeUndefined();
    expect(parseLeaguesParam("  ")).toBeUndefined();
    expect(parseLeaguesParam("brasileirao-a, libertadores ,brasileirao-a")).toEqual(["brasileirao-a", "libertadores"]);
    expect(() => parseLeaguesParam("brasileirao-a,inventada,outra")).toThrow(/inventada, outra/);
  });

  it("id: aceita ':' puro ou codificado; rejeita vazio, enorme e com caracteres de caminho", () => {
    expect(parseIdParam("espn:bra.1:123")).toBe("espn:bra.1:123");
    expect(parseIdParam("espn%3Abra.1%3A123")).toBe("espn:bra.1:123");
    for (const bad of ["", "a".repeat(121), "espn:a b", "espn:../x", "espn:a?b", "espn:a#b"]) expect(() => parseIdParam(bad), bad).toThrow(/Identificador/);
  });

  it("Cache-Control: s-maxage = TTL; stale-while-revalidate curto nos dados rápidos", () => {
    expect(cacheControl(20)).toBe("public, s-maxage=20, stale-while-revalidate=5");
    expect(cacheControl(600)).toBe("public, s-maxage=600, stale-while-revalidate=300");
    expect(cacheControl(21600)).toBe("public, s-maxage=21600, stale-while-revalidate=300");
    expect(cacheControl(0)).toBe("public, s-maxage=1, stale-while-revalidate=5"); // nunca 0
  });
});

describe("GET /api/leagues", () => {
  it("catálogo com as fontes que cobrem cada liga, cacheável por 1 h", async () => {
    const res = await getLeagues();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("s-maxage=3600");
    const { data } = await res.json();
    expect(data).toHaveLength(LEAGUE_IDS.length);
    expect(data[0]).toMatchObject({ id: "brasileirao-a", name: "Campeonato Brasileiro Série A", sources: ["espn"] });
  });
});

describe("GET /api/matches", () => {
  it("devolve { data, meta } com proveniência e cabeçalhos de cache", async () => {
    const res = await getMatches(req(`/api/matches?date=${today()}&leagues=brasileirao-a,libertadores`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta).toMatchObject({ source: "espn", sources: ["espn"], cache: "miss", fallback: false, missing: [], failures: [] });
    expect(res.headers.get("x-placar-source")).toBe("espn");
    expect(res.headers.get("x-placar-cache")).toBe("miss");
    expect(res.headers.get("x-placar-fallback")).toBeNull();
    expect(res.headers.get("cache-control")).toBe(cacheControl(body.meta.ttlSeconds));
  });

  it("sem data usa hoje; sem ligas usa todas", async () => {
    const body = await (await getMatches(req("/api/matches"))).json();
    expect(body.data).toHaveLength(LEAGUE_IDS.length);
  });

  it("jogo ao vivo → s-maxage curto (20 s)", async () => {
    install(source("espn", { matches: (ls) => ls.map((l) => mkMatch("espn", l, { status: "live", clock: "10'" })) }));
    const res = await getMatches(req(`/api/matches?date=${today()}&leagues=brasileirao-a`));
    expect(res.headers.get("cache-control")).toContain("s-maxage=20");
  });

  it("fonte principal caiu: responde com a reserva e avisa no cabeçalho e no corpo", async () => {
    install(source("espn", { fail: new DataSourceError("unavailable", "ESPN caiu", { source: "espn" }) }), source("football-data"));
    const res = await getMatches(req(`/api/matches?date=${today()}&leagues=brasileirao-a`));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-placar-source")).toBe("football-data");
    expect(res.headers.get("x-placar-fallback")).toBe("1");
    const body = await res.json();
    expect(body.meta.fallback).toBe(true);
    expect(body.meta.failures[0]).toMatchObject({ source: "espn", kind: "unavailable" });
  });

  it("parâmetros inválidos → 400 sem tocar nas fontes, e sem cache", async () => {
    const spy = vi.fn(() => []);
    install(source("espn", { matches: spy }));
    for (const q of ["date=ontem", "date=2020-01-01", "leagues=inventada", `date=${addDays(today(), 500)}`]) {
      const res = await getMatches(req(`/api/matches?${q}`));
      expect(res.status, q).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect((await res.json()).error.code).toBe("bad_request");
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("nenhuma fonte responde → 503 com Retry-After e o motivo de cada falha", async () => {
    install(source("espn", { fail: new DataSourceError("timeout", "lento", { source: "espn" }) }));
    const res = await getMatches(req(`/api/matches?date=${today()}&leagues=brasileirao-a`));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("15");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.error.code).toBe("all_sources_failed");
    expect(body.failures).toEqual([{ source: "espn", kind: "timeout", message: "lento" }]);
  });

  it("exceção inesperada numa fonte: 503, sem vazar o texto interno na resposta pública (só no log privado)", async () => {
    install(source("espn", { fail: new TypeError("segredo interno: /home/app/x.ts") }));
    const res = await getMatches(req(`/api/matches?date=${today()}&leagues=brasileirao-a`));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/segredo|\/home\/app/);
    expect(body.failures[0]).toMatchObject({ source: "espn", kind: "unexpected", message: "Erro inesperado na fonte" });
    // o texto real continua disponível, mas só em /api/status (protegido em produção)
    const status = await (await getStatus(req("/api/status"))).json();
    expect(status.recentErrors[0].message).toMatch(/segredo interno/);
  });

  it("bug no próprio código da rota (fora das fontes) → 500 genérico", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const quebrado = new Orchestrator({ sources: [source("espn")] });
    vi.spyOn(quebrado, "getMatchesByDate").mockRejectedValue(new TypeError("segredo interno: /home/app/y.ts"));
    setOrchestratorForTests(quebrado);
    const res = await getMatches(req(`/api/matches?date=${today()}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: "internal", message: "Erro interno." } });
  });
});

describe("GET /api/live", () => {
  it("lista os jogos em andamento", async () => {
    // o ao vivo é derivado da lista do dia: um jogo ao vivo na Série A e os demais agendados
    install(source("espn", { matches: (ls) => ls.map((l) => mkMatch("espn", l, l === "brasileirao-a" ? { status: "live", clock: "67'" } : {})) }));
    const res = await getLive(req("/api/live?leagues=brasileirao-a"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0]).toMatchObject({ status: "live", clock: "67'" });
    expect(res.headers.get("cache-control")).toContain("s-maxage=20");
  });

  it("sem jogos ao vivo → 200 com lista vazia", async () => {
    const res = await getLive(req("/api/live"));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

describe("GET /api/matches/[id]", () => {
  it("aceita o id com ':' sem codificar e codificado", async () => {
    for (const raw of ["espn:bra.1:401841272", "espn%3Abra.1%3A401841272"]) {
      const res = await getMatch(req("/api/matches/x"), ctx({ id: raw }));
      expect(res.status, raw).toBe(200);
      expect((await res.json()).data.id).toBe("espn:bra.1:401841272");
    }
  });

  it("id malformado → 400; fonte inativa → 404 'unsupported'", async () => {
    const bad = await getMatch(req("/api/matches/x"), ctx({ id: "lixo" }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("invalid_id");
    const inactive = await getMatch(req("/api/matches/x"), ctx({ id: "openfootball:brasileirao-a:2026:x" }));
    expect(inactive.status).toBe(404);
    expect((await inactive.json()).error.code).toBe("unsupported");
  });

  it("jogo inexistente → 404 sem expor a mensagem da fonte", async () => {
    install(source("espn", { fail: new DataSourceError("not_found", "http://upstream/secreto 404", { source: "espn" }) }));
    const res = await getMatch(req("/api/matches/x"), ctx({ id: "espn:bra.1:999" }));
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toMatch(/upstream/);
  });

  it("id enorme ou com caracteres de caminho → 400 antes de qualquer consulta", async () => {
    expect((await getMatch(req("/x"), ctx({ id: "espn:" + "a".repeat(200) }))).status).toBe(400);
    expect((await getMatch(req("/x"), ctx({ id: "espn:../../etc" }))).status).toBe(400);
  });

  it("fonte caída → 503 com Retry-After", async () => {
    install(source("espn", { fail: new DataSourceError("unavailable", "x", { source: "espn" }) }));
    const res = await getMatch(req("/x"), ctx({ id: "espn:bra.1:1" }));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("15");
  });
});

describe("GET /api/standings/[leagueId]", () => {
  it("devolve a tabela com TTL de 10 min", async () => {
    const res = await getStandings(req("/x"), ctx({ leagueId: "brasileirao-a" }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ leagueId: "brasileirao-a" });
    expect(res.headers.get("cache-control")).toContain("s-maxage=600");
  });

  it("liga desconhecida → 404", async () => {
    const res = await getStandings(req("/x"), ctx({ leagueId: "inventada" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("unknown_league");
  });
});

describe("GET /api/teams/[id]", () => {
  it("passa a liga para a fonte quando informada", async () => {
    const body = await (await getTeam(req("/api/teams/x?league=brasileirao-a"), ctx({ id: "espn:874" }))).json();
    expect(body.data.leagueIds).toEqual(["brasileirao-a"]);
    const sem = await (await getTeam(req("/api/teams/x"), ctx({ id: "espn:874" }))).json();
    expect(sem.data.leagueIds).toEqual([]);
  });

  it("liga desconhecida → 404; id inválido → 400", async () => {
    expect((await getTeam(req("/api/teams/x?league=inventada"), ctx({ id: "espn:874" }))).status).toBe(404);
    expect((await getTeam(req("/api/teams/x"), ctx({ id: "lixo" }))).status).toBe(400);
  });
});

describe("GET /api/status", () => {
  it("em desenvolvimento/teste responde aberto, sem cache", async () => {
    await getMatches(req(`/api/matches?date=${today()}&leagues=brasileirao-a`));
    const res = await getStatus(req("/api/status"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.sources[0]).toMatchObject({ id: "espn", health: { state: "closed" } });
    expect(body.sources[0].quota.remaining).toBeLessThan(body.sources[0].quota.max);
    expect(body.cacheEntries).toBeGreaterThan(0);
  });

  it("com STATUS_TOKEN exige o Bearer certo", async () => {
    vi.stubEnv("STATUS_TOKEN", "segredo");
    expect((await getStatus(req("/api/status"))).status).toBe(401);
    expect((await getStatus(req("/api/status", { authorization: "Bearer errado" }))).status).toBe(401);
    expect((await getStatus(req("/api/status", { authorization: "Bearer segredo" }))).status).toBe(200);
  });

  it("em produção sem STATUS_TOKEN a rota nem existe (404)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STATUS_TOKEN", "");
    expect((await getStatus(req("/api/status"))).status).toBe(404);
  });

  it("mostra os erros recentes das fontes", async () => {
    install(source("espn", { fail: new DataSourceError("unavailable", "ESPN caiu", { source: "espn" }) }), source("football-data"));
    await getMatches(req(`/api/matches?date=${today()}&leagues=brasileirao-a`));
    const body = await (await getStatus(req("/api/status"))).json();
    expect(body.recentErrors[0]).toMatchObject({ source: "espn", kind: "unavailable", operation: "matches" });
  });
});
