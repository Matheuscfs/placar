// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResponseMeta, Sourced } from "@/lib/domain/types";
import { useApi } from "./use-api";

type Payload = { n: number };

const meta = (over: Partial<ResponseMeta> = {}): ResponseMeta => ({ source: "espn", sources: ["espn"], fetchedAt: "2026-10-22T15:00:00Z", cache: "hit", ttlSeconds: 20, fallback: false, missing: [], failures: [], ...over });
const sourced = (n: number): Sourced<Payload> => ({ data: { n }, meta: meta() });

let calls: string[];
let responder: (url: string) => Response | Promise<Response>;

const ok = (n: number) => new Response(JSON.stringify(sourced(n)), { status: 200, headers: { "content-type": "application/json" } });
const fail = (status = 503, message = "Fonte indisponível no momento.") => new Response(JSON.stringify({ error: { code: "x", message } }), { status });

const every = (ms: number | null) => ({ nextRefreshMs: () => ms });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  calls = [];
  let n = 0;
  responder = () => ok(++n);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (calls.push(url), responder(url))));
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("useApi — carga", () => {
  it("começa carregando e entrega os dados", async () => {
    const { result } = renderHook(() => useApi<Payload>("/api/x", every(null)));
    expect(result.current).toMatchObject({ loading: true, data: null, error: null });
    await flush();
    expect(result.current.loading).toBe(false);
    expect(result.current.data?.data).toEqual({ n: 1 });
    expect(calls).toEqual(["/api/x"]);
  });

  it("dados que o servidor já mandou valem na hora e NÃO disparam busca", async () => {
    const { result } = renderHook(() => useApi<Payload>("/api/x", { initial: sourced(7), initialUrl: "/api/x", ...every(null) }));
    expect(result.current).toMatchObject({ loading: false, data: { data: { n: 7 } } });
    await advance(60_000);
    expect(calls).toHaveLength(0);
  });

  it("inicial de OUTRA url não é usado (nunca mostra dados da tela errada)", async () => {
    const { result } = renderHook(() => useApi<Payload>("/api/y", { initial: sourced(7), initialUrl: "/api/x", ...every(null) }));
    expect(result.current.data).toBeNull();
    await flush();
    expect(calls).toEqual(["/api/y"]);
    expect(result.current.data?.data.n).toBe(1);
  });

  it("trocar a URL volta a 'carregando' em vez de mostrar os dados da URL anterior", async () => {
    const { result, rerender } = renderHook(({ url }) => useApi<Payload>(url, every(null)), { initialProps: { url: "/api/a" } });
    await flush();
    expect(result.current.data?.data.n).toBe(1);
    rerender({ url: "/api/b" });
    expect(result.current).toMatchObject({ loading: true, data: null });
    await flush();
    expect(calls).toEqual(["/api/a", "/api/b"]);
    expect(result.current.data?.data.n).toBe(2);
  });

  it("url nula não busca nada", async () => {
    const { result } = renderHook(() => useApi<Payload>(null, every(1000)));
    await advance(10_000);
    expect(calls).toHaveLength(0);
    expect(result.current.data).toBeNull();
  });

  it("resposta de uma busca antiga não sobrescreve a da URL atual", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    responder = async (url) => {
      if (url === "/api/lenta") await slow;
      return ok(url === "/api/lenta" ? 111 : 222);
    };
    const { result, rerender } = renderHook(({ url }) => useApi<Payload>(url, every(null)), { initialProps: { url: "/api/lenta" } });
    rerender({ url: "/api/rapida" });
    await flush();
    release();
    await flush();
    expect(result.current.data?.data.n).toBe(222);
  });
});

describe("useApi — atualização periódica", () => {
  it("busca de novo no intervalo pedido, mantendo os dados na tela e marcando 'atualizando'", async () => {
    const { result } = renderHook(() => useApi<Payload>("/api/x", every(20_000)));
    await flush();
    expect(calls).toHaveLength(1);
    await advance(19_999);
    expect(calls).toHaveLength(1);
    await advance(1);
    expect(calls).toHaveLength(2);
    await flush();
    expect(result.current.data?.data.n).toBe(2);
    expect(result.current.refreshing).toBe(false);
  });

  it("'atualizando' acende durante a busca, sem apagar os dados", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    responder = async () => {
      if (!first) await gate;
      first = false;
      return ok(1);
    };
    const { result } = renderHook(() => useApi<Payload>("/api/x", every(10_000)));
    await flush();
    await advance(10_000);
    expect(result.current).toMatchObject({ refreshing: true });
    expect(result.current.data).not.toBeNull();
    release();
    await flush();
    expect(result.current.refreshing).toBe(false);
  });

  it("nextRefreshMs nulo → não atualiza", async () => {
    renderHook(() => useApi<Payload>("/api/x", every(null)));
    await flush();
    await advance(10 * 60_000);
    expect(calls).toHaveLength(1);
  });

  it("o intervalo é reavaliado com os dados novos (ao vivo acelera, acabou desacelera)", async () => {
    const seen: Array<number | null> = [];
    const { result } = renderHook(() =>
      useApi<Payload>("/api/x", {
        nextRefreshMs: (d) => {
          const ms = d && d.data.n >= 2 ? null : 5_000;
          seen.push(ms);
          return ms;
        },
      }),
    );
    await flush();
    await advance(5_000);
    await flush();
    expect(result.current.data?.data.n).toBe(2);
    const before = calls.length;
    await advance(60_000);
    expect(calls).toHaveLength(before); // n=2 → parou
  });

  it("refresh() manual busca na hora", async () => {
    const { result } = renderHook(() => useApi<Payload>("/api/x", every(null)));
    await flush();
    act(() => result.current.refresh());
    await flush();
    expect(calls).toHaveLength(2);
    expect(result.current.data?.data.n).toBe(2);
  });
});

describe("useApi — falhas", () => {
  it("primeira carga falha: mostra o motivo da API, sem dados, e tenta de novo com recuo (15 s → 30 s → 60 s)", async () => {
    responder = () => fail(503, "Nenhuma fonte de dados respondeu agora.");
    const { result } = renderHook(() => useApi<Payload>("/api/x", { nextRefreshMs: (_d, failures) => (failures > 0 ? 15_000 * 2 ** (failures - 1) : null) }));
    await flush();
    expect(result.current).toMatchObject({ loading: false, data: null, error: "Nenhuma fonte de dados respondeu agora." });
    expect(calls).toHaveLength(1);
    await advance(15_000);
    expect(calls).toHaveLength(2);
    await advance(29_999);
    expect(calls).toHaveLength(2);
    await advance(1);
    expect(calls).toHaveLength(3);
    await advance(60_000);
    expect(calls).toHaveLength(4);
  });

  it("falha numa ATUALIZAÇÃO mantém os dados antigos na tela e registra o erro", async () => {
    let n = 0;
    responder = () => (++n === 1 ? ok(1) : fail());
    const { result } = renderHook(() => useApi<Payload>("/api/x", every(10_000)));
    await flush();
    await advance(10_000);
    await flush();
    expect(result.current.data?.data.n).toBe(1);
    expect(result.current.error).toBe("Fonte indisponível no momento.");
    expect(result.current.refreshing).toBe(false);
  });

  it("depois de uma falha, o sucesso seguinte limpa o erro", async () => {
    let n = 0;
    responder = () => (++n === 2 ? fail() : ok(n));
    const { result } = renderHook(() => useApi<Payload>("/api/x", { nextRefreshMs: (_d, failures) => (failures > 0 ? 15_000 : 10_000) }));
    await flush();
    await advance(10_000);
    await flush();
    expect(result.current.error).not.toBeNull();
    await advance(15_000);
    await flush();
    expect(result.current.error).toBeNull();
    expect(result.current.data?.data.n).toBe(3);
  });

  it("erro de rede (fetch lança) vira mensagem, não exceção", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const { result } = renderHook(() => useApi<Payload>("/api/x", every(null)));
    await flush();
    expect(result.current.error).toBe("Failed to fetch");
    expect(result.current.data).toBeNull();
  });

  it("corpo que não é JSON → mensagem padrão", async () => {
    responder = () => new Response("<html>erro</html>", { status: 502 });
    const { result } = renderHook(() => useApi<Payload>("/api/x", every(null)));
    await flush();
    expect(result.current.error).toBe("Não foi possível carregar os dados.");
  });

  it("200 sem os metadados esperados também é tratado como erro (resposta fora do contrato)", async () => {
    responder = () => new Response(JSON.stringify({ data: { n: 1 } }), { status: 200 });
    const { result } = renderHook(() => useApi<Payload>("/api/x", every(null)));
    await flush();
    expect(result.current.data).toBeNull();
    expect(result.current.error).not.toBeNull();
  });
});

describe("useApi — aba escondida e sem internet", () => {
  const setVisibility = (v: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  it("com a aba escondida não busca; ao voltar, busca na hora o que venceu", async () => {
    renderHook(() => useApi<Payload>("/api/x", every(10_000)));
    await flush();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    await advance(10_000);
    await advance(60_000);
    expect(calls).toHaveLength(1);
    await act(async () => setVisibility("visible"));
    await flush();
    expect(calls).toHaveLength(2);
  });

  it("voltar para a aba sem nada vencido não busca à toa", async () => {
    renderHook(() => useApi<Payload>("/api/x", every(60_000)));
    await flush();
    await act(async () => setVisibility("hidden"));
    await act(async () => setVisibility("visible"));
    await flush();
    expect(calls).toHaveLength(1);
  });

  it("sem internet não busca; quando volta (evento online), busca", async () => {
    renderHook(() => useApi<Payload>("/api/x", every(10_000)));
    await flush();
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    await advance(10_000);
    expect(calls).toHaveLength(1);
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    await act(async () => void window.dispatchEvent(new Event("online")));
    await flush();
    expect(calls).toHaveLength(2);
  });
});

describe("useApi — limpeza", () => {
  it("ao desmontar, não busca mais nem deixa timer pendente", async () => {
    const { unmount } = renderHook(() => useApi<Payload>("/api/x", every(10_000)));
    await flush();
    unmount();
    await advance(60_000);
    expect(calls).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fetchedAt vem do instante em que a FONTE foi consultada (meta.fetchedAt), não do relógio local", async () => {
    const { result } = renderHook(() => useApi<Payload>("/api/x", every(null)));
    await flush();
    expect(result.current.fetchedAt).toBe(Date.parse("2026-10-22T15:00:00Z"));
  });
});
