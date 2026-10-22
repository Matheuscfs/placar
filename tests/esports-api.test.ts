import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getEsports } from "@/app/api/esports/matches/route";
import { addDays, todayIso } from "@/lib/domain/dates";
import fixture from "@/lib/esports/__fixtures__/matches.json";
import { EsportsError } from "@/lib/esports/errors";
import { EsportsService, setEsportsServiceForTests } from "@/lib/esports/service";

const req = (qs = "") => new Request(`http://localhost/api/esports/matches${qs}`);
const raw = fixture as unknown[];

let outcome: () => Promise<{ matches: unknown[]; truncated: boolean; remaining: number | null }>;
let fetches: number;

beforeEach(() => {
  fetches = 0;
  outcome = async () => ({ matches: raw, truncated: false, remaining: 800 });
  vi.stubEnv("PANDASCORE_TOKEN", "token-de-teste");
  setEsportsServiceForTests(
    new EsportsService({
      client: {
        matchesBetween: async () => {
          fetches++;
          return outcome();
        },
      },
    }),
  );
});
afterEach(() => {
  setEsportsServiceForTests(null);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/esports/matches", () => {
  it("sem PANDASCORE_TOKEN: 503 'esports_not_configured'", async () => {
    vi.stubEnv("PANDASCORE_TOKEN", "");
    setEsportsServiceForTests(null);
    const res = await getEsports(req());
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("esports_not_configured");
  });

  it("devolve { data, meta } com Cache-Control derivado do TTL", async () => {
    const res = await getEsports(req(`?date=${todayIso()}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(7);
    expect(body.meta).toMatchObject({ source: "pandascore", cache: "miss", truncated: false });
    expect(res.headers.get("cache-control")).toMatch(/^public, s-maxage=\d+, stale-while-revalidate=\d+$/);
    expect(res.headers.get("x-placar-source")).toBe("pandascore");
  });

  it("padrão é hoje; ?games= filtra sem nova chamada à fonte", async () => {
    await getEsports(req());
    const lol = await (await getEsports(req("?games=lol"))).json();
    expect(lol.data.every((m: { game: string }) => m.game === "lol")).toBe(true);
    expect(lol.meta.cache).toBe("hit");
    expect(fetches).toBe(1);
  });

  it("valida os parâmetros: data inválida, fora da janela, jogo desconhecido → 400", async () => {
    expect((await getEsports(req("?date=ontem"))).status).toBe(400);
    expect((await getEsports(req(`?date=${addDays(todayIso(), 500)}`))).status).toBe(400);
    expect((await getEsports(req("?games=dota"))).status).toBe(400);
    expect(fetches).toBe(0);
  });

  it("PandaScore fora do ar ou token recusado: 503 'esports_unavailable', sem vazar o motivo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const e of [new EsportsError("auth", "token ruim", { status: 401 }), new EsportsError("unavailable", "caiu"), new EsportsError("timeout", "lento"), new EsportsError("bad_response", "mudou")]) {
      outcome = async () => Promise.reject(e);
      setEsportsServiceForTests(new EsportsService({ client: { matchesBetween: async () => outcome() } }));
      const res = await getEsports(req());
      expect(res.status, e.kind).toBe(503);
      const text = await res.text();
      expect(JSON.parse(text).error.code).toBe("esports_unavailable");
      expect(text).not.toMatch(/token|401|mudou|caiu/i);
    }
  });

  it("erro inesperado vira 500 genérico, nunca vaza a mensagem", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    outcome = async () => Promise.reject(new Error("segredo interno"));
    setEsportsServiceForTests(new EsportsService({ client: { matchesBetween: async () => outcome() } }));
    const res = await getEsports(req());
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("segredo interno");
  });
});
