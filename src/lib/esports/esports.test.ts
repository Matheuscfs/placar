import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/lib/data/cache";
import fixture from "./__fixtures__/matches.json";
import { PandaScoreClient, type FetchLike } from "./client";
import { EsportsError } from "./errors";
import { parseGamesParam, toApiError } from "./http";
import { convertMatch, convertMatches, dayRange } from "./pandascore";
import { ESPORTS_HOURLY_BUDGET, ESPORTS_STALE, ESPORTS_TTL, EsportsService, getEsportsService, isEsportsConfigured, setEsportsServiceForTests } from "./service";
import { esportsGameDef } from "./types";

const raw = fixture as unknown[];
const byId = (id: number) => convertMatches(raw).find((m) => m.id === `pandascore:${id}`);

describe("convertMatches (fixtures escritas pela documentação)", () => {
  it("descarta o que não dá para mostrar (outro jogo, sem horário) e ordena por horário", () => {
    expect(convertMatches(raw).map((m) => m.id)).toEqual(["1006", "1004", "1001", "1005", "1002", "1009", "1003"].map((i) => `pandascore:${i}`));
  });

  it("partida encerrada: placar, vencedor, melhor de 3, tier, etapa e transmissões (principal/oficial primeiro)", () => {
    const m = byId(1001)!;
    expect(m).toMatchObject({ game: "cs2", status: "finished", bestOf: 3, forfeit: false, league: "Liga Aurora", serie: "Fall 2026", tournament: "Playoffs", tier: "S", scheduledAt: "2026-10-22T18:00:00Z" });
    expect(m.home).toMatchObject({ score: 2, winner: true, team: { id: "pandascore:501", name: "Alpha Esports", acronym: "ALP", logo: "https://cdn.example.com/teams/alpha.png" } });
    expect(m.away).toMatchObject({ score: 1, winner: false });
    expect(m.streams.map((s) => s.url)).toEqual(["https://www.twitch.tv/mainchannel", "https://www.twitch.tv/alt"]);
    expect(m.streams[0]).toMatchObject({ main: true, official: true, language: "en" });
  });

  it("em andamento: placar parcial, sem vencedor; etapa cai para `name` sem `full_name`; sigla e logo ausentes viram null", () => {
    const m = byId(1002)!;
    expect(m).toMatchObject({ game: "lol", status: "live", bestOf: 5, serie: "Split 3", tier: "A" });
    expect(m.home).toMatchObject({ score: 1, winner: false, team: { acronym: "CHA", logo: null } });
    expect(m.away).toMatchObject({ score: 2, winner: false, team: { acronym: null, logo: "https://cdn.example.com/teams/delta.png" } });
  });

  it("agendada com adversário indefinido: lado sem time, sem placar", () => {
    const m = byId(1003)!;
    expect(m).toMatchObject({ game: "valorant", status: "scheduled", tier: "B" });
    expect(m.home.team?.name).toBe("Echo Club");
    expect(m.away).toEqual({ team: null, score: null, winner: false });
    expect(m.home.score).toBeNull();
  });

  it("adiada e cancelada NÃO mostram o 0 x 0 que a fonte manda", () => {
    expect(byId(1004)).toMatchObject({ status: "postponed", home: { score: null }, away: { score: null } });
    expect(byId(1005)).toMatchObject({ status: "canceled", tier: "unranked" });
  });

  it("W.O. é marcado, e o vencedor continua sendo o do resultado", () => {
    expect(byId(1006)).toMatchObject({ forfeit: true, home: { winner: true, score: 2 } });
  });

  it("links perigosos: só https sem credenciais e sem repetição; logo http/javascript some; formato 'first_to' não vira melhor de N; tier desconhecido vira 'unranked'", () => {
    const m = byId(1009)!;
    expect(m.streams).toEqual([{ url: "https://www.twitch.tv/valido", language: "pt", official: false, main: false }]);
    expect(m.home.team?.logo).toBeNull();
    expect(m.away.team?.logo).toBeNull();
    expect(m.bestOf).toBeNull();
    expect(m.tier).toBe("unranked");
  });

  it("resiste a lixo: nunca lança", () => {
    for (const bad of [null, undefined, 42, "x", [], {}, { id: "1" }, { id: 1, status: "explodiu", videogame: { slug: "valorant" }, scheduled_at: "2026-10-22T10:00:00Z" }, { id: 1, status: "finished", videogame: { slug: "valorant" }, scheduled_at: "ontem" }]) {
      expect(() => convertMatch(bad)).not.toThrow();
      expect(convertMatch(bad)).toBeNull();
    }
    const odd = convertMatch({ id: 7, status: "finished", videogame: { slug: "valorant" }, scheduled_at: "2026-10-22T10:00:00Z", opponents: "x", results: [null, { team_id: "a" }, { team_id: 1, score: "2" }], streams_list: { a: 1 } });
    expect(odd).toMatchObject({ league: "Campeonato", serie: null, home: { team: null }, away: { team: null }, streams: [] });
  });

  it("usa begin_at quando não há scheduled_at, e remove repetidas", () => {
    const base = { id: 9, status: "running", videogame: { slug: "league-of-legends" }, begin_at: "2026-10-22T10:00:00Z" };
    expect(convertMatches([base, base])).toHaveLength(1);
    expect(convertMatch(base)?.scheduledAt).toBe("2026-10-22T10:00:00Z");
  });

  it("nomes dos jogos e o slug antigo do CS2", () => {
    expect(esportsGameDef("cs2").pandaSlug).toBe("cs-go");
    expect(esportsGameDef("lol").pandaSlug).toBe("league-of-legends");
  });
});

describe("dayRange", () => {
  it("o dia de Brasília (UTC-3) em instantes UTC, fim exclusivo", () => {
    expect(dayRange("2026-10-22")).toEqual({ start: "2026-10-22T03:00:00Z", end: "2026-10-23T03:00:00Z" });
    expect(dayRange("2026-12-31")).toEqual({ start: "2026-12-31T03:00:00Z", end: "2027-01-01T03:00:00Z" });
  });
});

// ───────────────────────── Cliente ─────────────────────────

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init });
const items = (n: number, from = 1) => Array.from({ length: n }, (_, i) => ({ id: from + i }));

describe("PandaScoreClient", () => {
  let calls: Array<{ url: URL; headers: Record<string, string> }>;
  let handler: (n: number) => Response | Promise<Response>;
  const fetchFake: FetchLike = async (input, init) => {
    calls.push({ url: new URL(input), headers: init?.headers as Record<string, string> });
    return handler(calls.length);
  };
  const client = () => new PandaScoreClient({ token: "SEGREDO-123", fetch: fetchFake });
  const range = ["2026-10-22T03:00:00Z", "2026-10-23T03:00:00Z"] as const;

  beforeEach(() => {
    calls = [];
    handler = () => json([]);
  });

  it("uma chamada para os três jogos, com filtro de horário, ordem e página; token no cabeçalho e NUNCA na URL", async () => {
    await client().matchesBetween(...range);
    expect(calls).toHaveLength(1);
    const { url, headers } = calls[0];
    expect(url.origin + url.pathname).toBe("https://api.pandascore.co/matches");
    expect(url.searchParams.get("filter[videogame]")).toBe("cs-go,league-of-legends,valorant");
    expect(url.searchParams.get("range[scheduled_at]")).toBe("2026-10-22T03:00:00Z,2026-10-23T03:00:00Z");
    expect(url.searchParams.get("sort")).toBe("scheduled_at");
    expect(url.searchParams.get("page[size]")).toBe("100");
    expect(url.searchParams.get("page[number]")).toBe("1");
    expect(headers.authorization).toBe("Bearer SEGREDO-123");
    expect(url.toString()).not.toContain("SEGREDO");
  });

  it("lê a cota restante do cabeçalho", async () => {
    handler = () => json([], { headers: { "x-rate-limit-remaining": "873" } });
    expect((await client().matchesBetween(...range)).remaining).toBe(873);
    handler = () => json([]);
    expect((await client().matchesBetween(...range)).remaining).toBeNull();
  });

  it("página cheia (100) pede a seguinte; página incompleta encerra", async () => {
    handler = (n) => json(n === 1 ? items(100) : items(30, 101));
    const r = await client().matchesBetween(...range);
    expect(calls.map((c) => c.url.searchParams.get("page[number]"))).toEqual(["1", "2"]);
    expect(r.matches).toHaveLength(130);
    expect(r.truncated).toBe(false);
  });

  it("para no limite de 3 páginas e avisa que a lista pode estar incompleta", async () => {
    handler = (n) => json(items(100, n * 100));
    const r = await client().matchesBetween(...range);
    expect(calls).toHaveLength(3);
    expect(r.matches).toHaveLength(300);
    expect(r.truncated).toBe(true);
  });

  it("cota local esgotada: aborta ANTES de chamar a rede", async () => {
    await expect(client().matchesBetween(...range, () => false)).rejects.toMatchObject({ kind: "rate_limited" });
    expect(calls).toHaveLength(0);
  });

  it("a cota é consultada a cada página", async () => {
    handler = () => json(items(100));
    const acquire = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
    await expect(client().matchesBetween(...range, acquire)).rejects.toMatchObject({ kind: "rate_limited" });
    expect(calls).toHaveLength(1);
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "rate_limited"],
    [500, "unavailable"],
    [503, "unavailable"],
    [404, "unavailable"],
  ] as const)("HTTP %i vira '%s'", async (status, kind) => {
    handler = () => new Response("x", { status });
    await expect(client().matchesBetween(...range)).rejects.toMatchObject({ name: "EsportsError", kind, status });
  });

  it("rede fora → unavailable; tempo esgotado → timeout", async () => {
    const fail = (e: Error) => new PandaScoreClient({ token: "t", fetch: async () => Promise.reject(e) });
    await expect(fail(new TypeError("fetch failed")).matchesBetween(...range)).rejects.toMatchObject({ kind: "unavailable" });
    await expect(fail(Object.assign(new Error("t"), { name: "TimeoutError" })).matchesBetween(...range)).rejects.toMatchObject({ kind: "timeout" });
    await expect(fail(Object.assign(new Error("a"), { name: "AbortError" })).matchesBetween(...range)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("corpo que não é JSON, ou que não é uma lista → bad_response", async () => {
    handler = () => new Response("<html>", { status: 200 });
    await expect(client().matchesBetween(...range)).rejects.toMatchObject({ kind: "bad_response" });
    handler = () => json({ error: "x" });
    await expect(client().matchesBetween(...range)).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("a mensagem de erro nunca contém o token", async () => {
    handler = () => new Response("x", { status: 401 });
    const e = await client().matchesBetween(...range).then(() => null, (x: unknown) => x as EsportsError);
    expect(e).not.toBeNull();
    expect(`${e?.message} ${JSON.stringify(e)}`).not.toContain("SEGREDO");
  });
});

// ───────────────────────── Serviço ─────────────────────────

describe("EsportsService", () => {
  const NOW = Date.parse("2026-10-22T15:00:00Z"); // 12h em Brasília
  let now: number;
  let fetches: number;
  let outcome: () => Promise<{ matches: unknown[]; truncated: boolean; remaining: number | null }>;
  const client = { matchesBetween: vi.fn(async (_s: string, _e: string, acquire?: () => boolean) => {
    if (acquire && !acquire()) throw new EsportsError("rate_limited", "cota");
    fetches++;
    return outcome();
  }) };
  const service = (over: { hourlyBudget?: number } = {}) => new EsportsService({ client, now: () => now, cache: new TtlCache({ now: () => now }), ...over });

  beforeEach(() => {
    now = NOW;
    fetches = 0;
    client.matchesBetween.mockClear();
    outcome = async () => ({ matches: raw, truncated: false, remaining: 900 });
  });

  it("devolve as partidas convertidas, com meta honesta (fonte, cache, TTL)", async () => {
    const r = await service().getMatchesByDate("2026-10-22");
    expect(r.data).toHaveLength(7);
    expect(r.meta).toEqual({ source: "pandascore", fetchedAt: new Date(NOW).toISOString(), cache: "miss", ttlSeconds: ESPORTS_TTL.today, truncated: false });
  });

  it("pede ao PandaScore o intervalo do dia de Brasília", async () => {
    await service().getMatchesByDate("2026-10-22");
    expect(client.matchesBetween.mock.calls[0].slice(0, 2)).toEqual(["2026-10-22T03:00:00Z", "2026-10-23T03:00:00Z"]);
  });

  it("segunda leitura vem do cache; filtrar por jogo NÃO gasta chamada", async () => {
    const s = service();
    await s.getMatchesByDate("2026-10-22");
    const lol = await s.getMatchesByDate("2026-10-22", ["lol"]);
    const two = await s.getMatchesByDate("2026-10-22", ["cs2", "valorant"]);
    expect(fetches).toBe(1);
    expect(lol.data).toHaveLength(2); // a ao vivo e a cancelada dos exemplos
    expect(lol.data.every((m) => m.game === "lol")).toBe(true);
    expect(lol.meta.cache).toBe("hit");
    expect(two.data.every((m) => m.game === "cs2" || m.game === "valorant")).toBe(true);
    expect((await s.getMatchesByDate("2026-10-22", [])).data).toHaveLength(7);
  });

  it("100 leituras simultâneas viram 1 chamada", async () => {
    const s = service();
    await Promise.all(Array.from({ length: 100 }, () => s.getMatchesByDate("2026-10-22")));
    expect(fetches).toBe(1);
  });

  it("TTL por tipo de dia: hoje curto, passado longo, futuro médio", async () => {
    const s = service();
    expect((await s.getMatchesByDate("2026-10-22")).meta.ttlSeconds).toBe(ESPORTS_TTL.today);
    expect((await s.getMatchesByDate("2026-10-20")).meta.ttlSeconds).toBe(ESPORTS_TTL.pastDay);
    expect((await s.getMatchesByDate("2026-10-25")).meta.ttlSeconds).toBe(ESPORTS_TTL.futureDay);
  });

  it("depois do TTL busca de novo", async () => {
    const s = service();
    await s.getMatchesByDate("2026-10-22");
    now += (ESPORTS_TTL.today + 1) * 1000;
    await s.getMatchesByDate("2026-10-22");
    expect(fetches).toBe(2);
  });

  it("se o PandaScore cai, serve o último dado bom (stale) dentro da janela; fora dela, erro", async () => {
    const s = service();
    await s.getMatchesByDate("2026-10-22");
    outcome = async () => Promise.reject(new EsportsError("unavailable", "fora"));
    now += (ESPORTS_TTL.today + 10) * 1000;
    const stale = await s.getMatchesByDate("2026-10-22");
    expect(stale.meta.cache).toBe("stale");
    expect(stale.data).toHaveLength(7);
    now += (ESPORTS_STALE.today + ESPORTS_TTL.today) * 1000;
    await expect(s.getMatchesByDate("2026-10-22")).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("sem dado nenhum e fonte fora: propaga o erro", async () => {
    outcome = async () => Promise.reject(new EsportsError("auth", "token ruim", { status: 401 }));
    await expect(service().getMatchesByDate("2026-10-22")).rejects.toMatchObject({ kind: "auth" });
  });

  it("carrega o aviso de lista truncada", async () => {
    outcome = async () => ({ matches: raw, truncated: true, remaining: null });
    expect((await service().getMatchesByDate("2026-10-22")).meta.truncated).toBe(true);
  });

  it(`orçamento por hora (${ESPORTS_HOURLY_BUDGET}): esgotado, para de chamar; a janela de 1 h renova`, async () => {
    const s = service({ hourlyBudget: 2 });
    await s.getMatchesByDate("2026-10-20");
    await s.getMatchesByDate("2026-10-21");
    await expect(s.getMatchesByDate("2026-10-23")).rejects.toMatchObject({ kind: "rate_limited" });
    expect(fetches).toBe(2);
    now += 3600_000 + 1;
    await expect(s.getMatchesByDate("2026-10-23")).resolves.toBeDefined();
  });
});

describe("serviço de produção e erros da API", () => {
  afterEach(() => {
    setEsportsServiceForTests(null);
    vi.unstubAllEnvs();
  });

  it("sem token: desligado e `getEsportsService` lança not_configured", () => {
    vi.stubEnv("PANDASCORE_TOKEN", "");
    expect(isEsportsConfigured()).toBe(false);
    expect(() => getEsportsService()).toThrowError(expect.objectContaining({ kind: "not_configured" }));
  });

  it("com token: ligado, e é o mesmo serviço (cache compartilhado) até o token mudar", () => {
    vi.stubEnv("PANDASCORE_TOKEN", "t1");
    expect(isEsportsConfigured()).toBe(true);
    const a = getEsportsService();
    expect(getEsportsService()).toBe(a);
    vi.stubEnv("PANDASCORE_TOKEN", "t2");
    expect(getEsportsService()).not.toBe(a);
  });

  it("parseGamesParam: valida contra a lista, aceita vazio, recusa desconhecido", () => {
    expect(parseGamesParam(null)).toBeUndefined();
    expect(parseGamesParam("  ")).toBeUndefined();
    expect(parseGamesParam("cs2, lol,cs2")).toEqual(["cs2", "lol"]);
    expect(() => parseGamesParam("dota")).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it("toApiError: not_configured e falhas viram 503 sem vazar o motivo; erros alheios passam intactos", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(toApiError(new EsportsError("not_configured", "x"))).toMatchObject({ status: 503, code: "esports_not_configured" });
    const auth = toApiError(new EsportsError("auth", "token ruim: SEGREDO", { status: 401 })) as { status: number; code: string; message: string };
    expect(auth).toMatchObject({ status: 503, code: "esports_unavailable" });
    expect(auth.message).not.toMatch(/token|SEGREDO|401/i);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("auth (HTTP 401)"));
    const other = new Error("outro");
    expect(toApiError(other)).toBe(other);
    log.mockRestore();
  });
});
