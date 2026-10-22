import { describe, expect, it } from "vitest";
import { TtlCache, type Fetched } from "./cache";
import { AllSourcesFailedError, DataSourceError, LocalQuotaError } from "./errors";
import { ErrorLog, HealthTracker, countsAsFailure } from "./health";
import { RateLimiter } from "./rate-limiter";

/** Relógio manual: o tempo só anda quando o teste manda. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (seconds: number) => void (t += seconds * 1000) };
}

const ok = <T>(value: T, ttl = 10, stale = 60): Fetched<T> => ({ value, ttlSeconds: ttl, staleSeconds: stale });
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("TtlCache", () => {
  it("primeira chamada busca (miss); a seguinte dentro do TTL não toca a fonte (hit)", async () => {
    const c = clock();
    const cache = new TtlCache({ now: c.now });
    let calls = 0;
    const fetcher = async () => ok(`v${++calls}`);

    const a = await cache.resolve("k", fetcher);
    expect(a).toMatchObject({ value: "v1", state: "miss", ttlSeconds: 10 });
    c.advance(4);
    const b = await cache.resolve("k", fetcher);
    expect(b).toMatchObject({ value: "v1", state: "hit", ttlSeconds: 6 }); // resta 6 s de frescor
    expect(b.fetchedAt).toBe(a.fetchedAt);
    expect(calls).toBe(1);
  });

  it("expirado: busca de novo", async () => {
    const c = clock();
    const cache = new TtlCache({ now: c.now });
    let calls = 0;
    const fetcher = async () => ok(++calls);
    await cache.resolve("k", fetcher);
    c.advance(10);
    expect(await cache.resolve("k", fetcher)).toMatchObject({ value: 2, state: "miss" });
  });

  it("o TTL é decidido pelo conteúdo buscado, por entrada", async () => {
    const c = clock();
    const cache = new TtlCache({ now: c.now });
    await cache.resolve("curto", async () => ok("a", 5));
    await cache.resolve("longo", async () => ok("b", 500));
    c.advance(60);
    expect((await cache.resolve("curto", async () => ok("a2", 5))).state).toBe("miss");
    expect((await cache.resolve("longo", async () => ok("b2", 500))).state).toBe("hit");
  });

  describe("uma busca por chave de cada vez (single-flight)", () => {
    it("requisições simultâneas compartilham UMA chamada à fonte", async () => {
      const cache = new TtlCache();
      const d = deferred<Fetched<string>>();
      let calls = 0;
      const fetcher = () => {
        calls++;
        return d.promise;
      };
      const all = Promise.all(Array.from({ length: 50 }, () => cache.resolve("k", fetcher)));
      d.resolve(ok("dado"));
      const results = await all;
      expect(calls).toBe(1);
      expect(results.every((r) => r.value === "dado")).toBe(true);
    });

    it("se a busca falha, todas as que esperavam recebem o erro; a próxima tenta de novo", async () => {
      const cache = new TtlCache();
      const d = deferred<Fetched<string>>();
      let calls = 0;
      const first = Promise.allSettled([cache.resolve("k", () => (calls++, d.promise)), cache.resolve("k", () => (calls++, d.promise))]);
      d.reject(new DataSourceError("unavailable", "caiu"));
      const settled = await first;
      expect(settled.map((s) => s.status)).toEqual(["rejected", "rejected"]);
      expect(calls).toBe(1);
      expect((await cache.resolve("k", async () => ok("voltou"))).value).toBe("voltou"); // não ficou preso
    });

    it("chaves diferentes não se bloqueiam", async () => {
      const cache = new TtlCache();
      const d = deferred<Fetched<string>>();
      const lenta = cache.resolve("lenta", () => d.promise);
      expect((await cache.resolve("rapida", async () => ok("x"))).value).toBe("x");
      d.resolve(ok("y"));
      expect((await lenta).value).toBe("y");
    });
  });

  describe("stale-if-error", () => {
    it("fonte falhou, mas há dado bom dentro da janela: serve o velho e diz por quê", async () => {
      const c = clock();
      const cache = new TtlCache({ now: c.now });
      await cache.resolve("k", async () => ok("bom", 10, 60));
      c.advance(30); // expirou (10 s), mas está dentro de 10 + 60
      const err = new DataSourceError("unavailable", "ESPN caiu");
      const r = await cache.resolve("k", async () => Promise.reject(err));
      expect(r).toMatchObject({ value: "bom", state: "stale", staleCause: err, ttlSeconds: 5 });
      expect(r.fetchedAt).toBe(1_000_000); // continua apontando para quando o dado foi de fato buscado
    });

    it("passou da janela de velho: o erro aparece", async () => {
      const c = clock();
      const cache = new TtlCache({ now: c.now });
      await cache.resolve("k", async () => ok("bom", 10, 60));
      c.advance(71);
      await expect(cache.resolve("k", async () => Promise.reject(new DataSourceError("timeout", "x")))).rejects.toMatchObject({ kind: "timeout" });
    });

    it("sem nada guardado: o erro aparece", async () => {
      await expect(new TtlCache().resolve("k", async () => Promise.reject(new DataSourceError("unavailable", "x")))).rejects.toMatchObject({ kind: "unavailable" });
    });

    it("quando a fonte volta, o dado novo substitui o velho", async () => {
      const c = clock();
      const cache = new TtlCache({ now: c.now });
      await cache.resolve("k", async () => ok("v1"));
      c.advance(20);
      await cache.resolve("k", async () => Promise.reject(new Error("x")));
      expect(await cache.resolve("k", async () => ok("v2"))).toMatchObject({ value: "v2", state: "miss" });
    });
  });

  describe("cache negativo", () => {
    const notFound = () => new DataSourceError("not_found", "não existe");
    const opts = { negativeTtlSeconds: (e: unknown) => (e instanceof DataSourceError && e.kind === "not_found" ? 60 : null) };

    it("'não existe' é guardado: a repetição não toca a fonte", async () => {
      const c = clock();
      const cache = new TtlCache({ now: c.now });
      let calls = 0;
      const fetcher = async () => (calls++, Promise.reject(notFound()));
      await expect(cache.resolve("k", fetcher, opts)).rejects.toMatchObject({ kind: "not_found" });
      c.advance(30);
      await expect(cache.resolve("k", fetcher, opts)).rejects.toMatchObject({ kind: "not_found" });
      expect(calls).toBe(1);
      c.advance(31);
      await expect(cache.resolve("k", fetcher, opts)).rejects.toMatchObject({ kind: "not_found" });
      expect(calls).toBe(2); // expirou: pergunta de novo
    });

    it("outros erros não são guardados", async () => {
      const cache = new TtlCache();
      let calls = 0;
      const fetcher = async () => (calls++, Promise.reject(new DataSourceError("unavailable", "x")));
      await expect(cache.resolve("k", fetcher, opts)).rejects.toBeDefined();
      await expect(cache.resolve("k", fetcher, opts)).rejects.toBeDefined();
      expect(calls).toBe(2);
    });
  });

  it("respeita o teto de entradas descartando as menos usadas recentemente", async () => {
    const cache = new TtlCache({ maxEntries: 3 });
    for (const k of ["a", "b", "c"]) await cache.resolve(k, async () => ok(k, 1000));
    await cache.resolve("a", async () => ok("novo", 1000)); // lê "a": passa a ser a mais recente
    await cache.resolve("d", async () => ok("d", 1000)); // estoura: sai a mais antiga ("b")
    expect(cache.size).toBe(3);
    let buscou = false;
    await cache.resolve("b", async () => ((buscou = true), ok("b2", 1000)));
    expect(buscou).toBe(true);
    buscou = false;
    await cache.resolve("a", async () => ((buscou = true), ok("a2", 1000)));
    expect(buscou).toBe(false);
  });
});

describe("RateLimiter", () => {
  const limits = { espn: { max: 3, windowSeconds: 60 }, "football-data": { max: 2, windowSeconds: 60 }, openfootball: { max: 5, windowSeconds: 60 } };

  it("libera até o máximo na janela e recusa o resto", () => {
    const c = clock();
    const rl = new RateLimiter(limits, c.now);
    expect([1, 2, 3, 4].map(() => rl.tryAcquire("espn"))).toEqual([true, true, true, false]);
    expect(rl.remaining("espn")).toBe(0);
  });

  it("a janela desliza: uma chamada antiga sai e libera uma vaga", () => {
    const c = clock();
    const rl = new RateLimiter(limits, c.now);
    rl.tryAcquire("espn"); // t=0
    c.advance(30);
    rl.tryAcquire("espn"); // t=30
    rl.tryAcquire("espn"); // t=30
    expect(rl.tryAcquire("espn")).toBe(false);
    c.advance(31); // t=61: a chamada de t=0 saiu da janela de 60 s
    expect(rl.remaining("espn")).toBe(1);
    expect(rl.tryAcquire("espn")).toBe(true);
    expect(rl.tryAcquire("espn")).toBe(false);
  });

  it("cada fonte tem a sua cota", () => {
    const rl = new RateLimiter(limits, clock().now);
    rl.tryAcquire("football-data");
    rl.tryAcquire("football-data");
    expect(rl.tryAcquire("football-data")).toBe(false);
    expect(rl.tryAcquire("espn")).toBe(true);
  });

  it("diz em quantos segundos a cota volta", () => {
    const c = clock();
    const rl = new RateLimiter(limits, c.now);
    expect(rl.retryAfterSeconds("espn")).toBe(0);
    for (let i = 0; i < 3; i++) rl.tryAcquire("espn");
    c.advance(20);
    expect(rl.retryAfterSeconds("espn")).toBe(40);
  });

  it("recusar não consome cota", () => {
    const c = clock();
    const rl = new RateLimiter(limits, c.now);
    for (let i = 0; i < 10; i++) rl.tryAcquire("football-data");
    c.advance(61);
    expect(rl.remaining("football-data")).toBe(2); // as 8 recusadas não ocuparam vaga
  });

  it("as cotas padrão ficam abaixo dos limites reais das fontes", () => {
    const rl = new RateLimiter();
    expect(rl.limit("football-data")).toMatchObject({ max: 8, windowSeconds: 60 }); // real: 10/min
  });
});

describe("HealthTracker (disjuntor)", () => {
  const down = new DataSourceError("unavailable", "caiu");
  const mk = () => {
    const c = clock();
    return { c, h: new HealthTracker({ now: c.now, failureThreshold: 3, cooldownSeconds: 30 }) };
  };

  it("fechado por padrão", () => {
    const { h } = mk();
    expect(h.state("espn")).toBe("closed");
    expect(h.canCall("espn")).toBe(true);
  });

  it("abre depois de 3 falhas seguidas e passa a pular a fonte", () => {
    const { h } = mk();
    h.recordFailure("espn", down);
    h.recordFailure("espn", down);
    expect(h.state("espn")).toBe("closed");
    h.recordFailure("espn", down);
    expect(h.state("espn")).toBe("open");
    expect(h.canCall("espn")).toBe(false);
    expect(h.snapshot("espn")).toMatchObject({ state: "open", consecutiveFailures: 3, lastError: { kind: "unavailable" } });
  });

  it("um sucesso no meio zera a contagem", () => {
    const { h } = mk();
    h.recordFailure("espn", down);
    h.recordFailure("espn", down);
    h.recordSuccess("espn");
    h.recordFailure("espn", down);
    h.recordFailure("espn", down);
    expect(h.state("espn")).toBe("closed");
  });

  it("depois do descanso, deixa passar UMA chamada de teste", () => {
    const { c, h } = mk();
    for (let i = 0; i < 3; i++) h.recordFailure("espn", down);
    c.advance(31);
    expect(h.state("espn")).toBe("half-open");
    expect(h.canCall("espn")).toBe(true); // a de teste
    expect(h.canCall("espn")).toBe(false); // as outras esperam o resultado
  });

  it("teste bem-sucedido fecha o disjuntor; falho reabre por mais um período", () => {
    const a = mk();
    for (let i = 0; i < 3; i++) a.h.recordFailure("espn", down);
    a.c.advance(31);
    a.h.canCall("espn");
    a.h.recordSuccess("espn");
    expect(a.h.state("espn")).toBe("closed");
    expect(a.h.canCall("espn")).toBe(true);

    const b = mk();
    for (let i = 0; i < 3; i++) b.h.recordFailure("espn", down);
    b.c.advance(31);
    b.h.canCall("espn");
    b.h.recordFailure("espn", down);
    expect(b.h.state("espn")).toBe("open");
    b.c.advance(29);
    expect(b.h.canCall("espn")).toBe(false);
    b.c.advance(2);
    expect(b.h.canCall("espn")).toBe(true);
  });

  it("chamada de teste que termina sem dizer nada sobre a saúde libera o próximo teste", () => {
    const { c, h } = mk();
    for (let i = 0; i < 3; i++) h.recordFailure("espn", down);
    c.advance(31);
    expect(h.canCall("espn")).toBe(true);
    h.release("espn");
    expect(h.canCall("espn")).toBe(true);
  });

  it("fontes são independentes", () => {
    const { h } = mk();
    for (let i = 0; i < 3; i++) h.recordFailure("espn", down);
    expect(h.canCall("football-data")).toBe(true);
  });

  it("o que conta como falha da fonte", () => {
    for (const kind of ["unavailable", "timeout", "bad_response", "rate_limited"] as const) expect(countsAsFailure(new DataSourceError(kind, "x")), kind).toBe(true);
    for (const kind of ["unsupported", "not_found", "invalid_id"] as const) expect(countsAsFailure(new DataSourceError(kind, "x")), kind).toBe(false);
    expect(countsAsFailure(new LocalQuotaError("espn", 10))).toBe(false); // nossa cota, não a fonte
    expect(countsAsFailure(new TypeError("bug"))).toBe(true);
  });
});

describe("ErrorLog", () => {
  it("guarda os mais recentes, do mais novo ao mais antigo, até o limite", () => {
    const log = new ErrorLog(3);
    for (let i = 1; i <= 5; i++) log.add({ at: i, source: "espn", operation: "op", kind: "unavailable", message: `erro ${i}` });
    expect(log.recent().map((e) => e.message)).toEqual(["erro 5", "erro 4", "erro 3"]);
    expect(log.recent(1)).toHaveLength(1);
  });
});

describe("erros do orquestrador", () => {
  it("AllSourcesFailedError carrega as falhas de cada fonte", () => {
    const e = new AllSourcesFailedError("tudo caiu", [{ source: "espn", kind: "timeout", message: "x" }]);
    expect(e).toBeInstanceOf(DataSourceError);
    expect(e.kind).toBe("unavailable");
    expect(e.failures).toHaveLength(1);
  });

  it("LocalQuotaError é um rate_limited com tempo de espera", () => {
    const e = new LocalQuotaError("football-data", 42);
    expect(e).toMatchObject({ kind: "rate_limited", source: "football-data", retryAfterSeconds: 42 });
  });
});
