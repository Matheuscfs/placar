import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testa o `public/sw.js` REAL, carregado numa caixa isolada (node:vm) com uma simulação em memória do
 * Cache API e do `fetch`. É a verificação automatizada da lógica (inclusive do fallback offline, que
 * não dá para exercitar sem cortar a rede); o registro de verdade se confere no navegador, em HTTPS.
 */
const SOURCE = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const ORIGIN = "http://localhost";

type Handler = (event: unknown) => void;
interface FakeRequest {
  url: string;
  method: string;
  mode: string;
}
interface FakeClient {
  url: string;
  focus: () => Promise<void>;
  navigate?: (url: string) => Promise<void>;
}
interface FakeEvent {
  request?: FakeRequest;
  responded: Promise<Response> | null;
  respondWith(p: Promise<Response> | Response): void;
  waitUntil(p: Promise<unknown>): void;
  waits: Array<Promise<unknown>>;
}

function makeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const urlOf = (r: unknown) => (typeof r === "string" ? new URL(r, ORIGIN).href : (r as { url: string }).url);
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const s = stores.get(name)!;
    return {
      match: async (r: unknown) => s.get(urlOf(r))?.clone(),
      put: async (r: unknown, res: Response) => {
        s.delete(urlOf(r)); // reinserir move para o fim, como no navegador
        s.set(urlOf(r), res);
      },
      add: async (r: unknown) => {
        s.set(urlOf(r), new Response("página offline"));
      },
      keys: async () => [...s.keys()].map((url) => ({ url })),
      delete: async (r: unknown) => s.delete(urlOf(r)),
    };
  };
  return { stores, open, keys: async () => [...stores.keys()], delete: async (n: string) => stores.delete(n) };
}

function loadWorker(fetchImpl: (r: FakeRequest) => Promise<Response>) {
  const handlers = new Map<string, Handler>();
  const caches = makeCaches();
  const skipWaiting = vi.fn(async () => undefined);
  const claim = vi.fn(async () => undefined);
  const showNotification = vi.fn<(title: string, options: Record<string, unknown>) => Promise<void>>(async () => undefined);
  const openWindow = vi.fn<(url: string) => Promise<void>>(async () => undefined);
  const windows: FakeClient[] = [];
  const matchAll = vi.fn(async () => windows);
  const self = {
    addEventListener: (type: string, h: Handler) => handlers.set(type, h),
    location: { origin: ORIGIN },
    skipWaiting,
    clients: { claim, matchAll, openWindow },
    registration: { showNotification },
  };
  // Request com URL relativa, como dentro de um service worker de verdade.
  class SWRequest extends Request {
    constructor(input: string | Request, init?: RequestInit) {
      super(typeof input === "string" ? new URL(input, ORIGIN).href : input, init);
    }
  }
  const context = vm.createContext({ self, caches, fetch: fetchImpl, Request: SWRequest, Response, URL, setTimeout, clearTimeout, Promise, JSON, Set });
  vm.runInContext(SOURCE, context);

  const event = (request?: FakeRequest): FakeEvent => {
    const e: FakeEvent = {
      request,
      responded: null,
      waits: [],
      respondWith(p) {
        e.responded = Promise.resolve(p);
      },
      waitUntil(p) {
        e.waits.push(p);
      },
    };
    return e;
  };
  const dispatch = async (type: string, request?: FakeRequest, extra: Record<string, unknown> = {}) => {
    const e = Object.assign(event(request), extra);
    handlers.get(type)?.(e);
    await Promise.all(e.waits);
    return e;
  };
  return { caches, skipWaiting, claim, dispatch, handlers, showNotification, openWindow, windows };
}

const get = (path: string, mode = "cors"): FakeRequest => ({ url: new URL(path, ORIGIN).href, method: "GET", mode });
const ok = (body: string, status = 200) => new Response(body, { status });
const NAMES = { STATIC: "placar-static-v1", API: "placar-api-v1", PAGES: "placar-pages-v1" };

let network: (r: FakeRequest) => Promise<Response>;
let calls: string[];

beforeEach(() => {
  calls = [];
  network = async (r) => ok(`rede:${new URL(r.url).pathname}`);
});
afterEach(() => vi.useRealTimers());

const sw = () => loadWorker(async (r) => (calls.push(new URL(r.url).pathname), network(r)));
const text = async (e: FakeEvent) => (await e.responded!).text();

describe("instalação e ativação", () => {
  it("instala guardando a página offline e assume o controle sem esperar", async () => {
    const w = sw();
    await w.dispatch("install");
    expect([...(w.caches.stores.get(NAMES.PAGES)?.keys() ?? [])]).toEqual([`${ORIGIN}/offline`]);
    expect(w.skipWaiting).toHaveBeenCalled();
  });

  it("ao ativar, apaga os caches de versões antigas do Placar e mantém os atuais e os de terceiros", async () => {
    const w = sw();
    for (const n of ["placar-static-v0", "placar-api-v0", NAMES.STATIC, NAMES.API, NAMES.PAGES, "outro-app-cache"]) await w.caches.open(n);
    await w.dispatch("activate");
    expect([...(await w.caches.keys())].sort()).toEqual([NAMES.API, NAMES.PAGES, NAMES.STATIC, "outro-app-cache"].sort());
    expect(w.claim).toHaveBeenCalled();
  });
});

describe("o que o service worker NÃO toca", () => {
  it("POST, outra origem, /api/status e recursos que não são páginas nem arquivos do app", async () => {
    const w = sw();
    const cases: FakeRequest[] = [
      { ...get("/api/matches"), method: "POST" },
      { url: "https://a.espncdn.com/combiner/i?img=/x.png", method: "GET", mode: "no-cors" },
      get("/api/status"),
      get("/api/cron/push"),
      get("/favicon.ico"),
      get("/qualquer-coisa.json"),
    ];
    for (const c of cases) expect((await w.dispatch("fetch", c)).responded, c.url).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("arquivos imutáveis (/_next/static, ícones): cache primeiro", () => {
  it("busca na rede uma vez e depois serve do cache, sem rede", async () => {
    const w = sw();
    expect(await text(await w.dispatch("fetch", get("/_next/static/chunks/app.js")))).toBe("rede:/_next/static/chunks/app.js");
    expect(await text(await w.dispatch("fetch", get("/_next/static/chunks/app.js")))).toBe("rede:/_next/static/chunks/app.js");
    expect(calls).toHaveLength(1);
    expect(await text(await w.dispatch("fetch", get("/pwa-icon/192")))).toContain("/pwa-icon/192");
  });

  it("resposta de erro não é guardada", async () => {
    const w = sw();
    network = async () => ok("não achei", 404);
    await w.dispatch("fetch", get("/_next/static/x.js"));
    const e = await w.dispatch("fetch", get("/_next/static/x.js"));
    expect((await e.responded!).status).toBe(404);
    expect(calls).toHaveLength(2); // não veio do cache
  });
});

describe("/api: rede primeiro, último dado bom se cair", () => {
  it("com rede devolve o dado novo e o guarda", async () => {
    const w = sw();
    expect(await text(await w.dispatch("fetch", get("/api/matches?date=2026-10-24")))).toBe("rede:/api/matches");
    expect(w.caches.stores.get(NAMES.API)?.has(`${ORIGIN}/api/matches?date=2026-10-24`)).toBe(true);
  });

  it("sem rede devolve o ÚLTIMO dado bom da mesma URL", async () => {
    const w = sw();
    network = async () => ok("placar 1x0");
    await w.dispatch("fetch", get("/api/matches?date=2026-10-24"));
    await new Promise((r) => setTimeout(r, 0)); // deixa a gravação em cache terminar
    network = async () => Promise.reject(new TypeError("Failed to fetch"));
    expect(await text(await w.dispatch("fetch", get("/api/matches?date=2026-10-24")))).toBe("placar 1x0");
  });

  it("sem rede e sem nada guardado: 503 em JSON com o código 'offline' (a interface mostra o aviso)", async () => {
    const w = sw();
    network = async () => Promise.reject(new TypeError("Failed to fetch"));
    const res = await (await w.dispatch("fetch", get("/api/matches?date=2026-10-30"))).responded!;
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: { code: "offline", message: "Sem conexão." } });
  });

  it("rede que não responde em 6 s conta como falha e cai no dado guardado", async () => {
    vi.useFakeTimers();
    const w = sw();
    network = async () => ok("dado guardado");
    await w.dispatch("fetch", get("/api/live"));
    await vi.advanceTimersByTimeAsync(0);
    network = () => new Promise<Response>(() => undefined); // nunca responde
    const e = await w.dispatch("fetch", get("/api/live"));
    const pending = text(e);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await pending).toBe("dado guardado");
  });

  it("resposta de erro do servidor (500) é entregue, mas NÃO sobrescreve o dado bom guardado", async () => {
    const w = sw();
    network = async () => ok("dado bom");
    await w.dispatch("fetch", get("/api/live"));
    await new Promise((r) => setTimeout(r, 0));
    network = async () => ok("erro", 500);
    expect((await (await w.dispatch("fetch", get("/api/live"))).responded!).status).toBe(500);
    network = async () => Promise.reject(new TypeError("offline"));
    expect(await text(await w.dispatch("fetch", get("/api/live")))).toBe("dado bom");
  });

  it("mantém só as 60 respostas mais recentes", async () => {
    const w = sw();
    for (let i = 0; i < 65; i++) {
      await w.dispatch("fetch", get(`/api/matches?date=2026-01-${String(i).padStart(2, "0")}`));
      await new Promise((r) => setTimeout(r, 0));
    }
    await new Promise((r) => setTimeout(r, 10));
    const keys = [...(w.caches.stores.get(NAMES.API)?.keys() ?? [])];
    expect(keys).toHaveLength(60);
    expect(keys).not.toContain(`${ORIGIN}/api/matches?date=2026-01-00`); // as mais antigas saíram
    expect(keys).toContain(`${ORIGIN}/api/matches?date=2026-01-64`);
  });
});

describe("páginas (navegação): rede primeiro, cópia ou página offline se cair", () => {
  it("com rede, entrega a página e guarda uma cópia", async () => {
    const w = sw();
    expect(await text(await w.dispatch("fetch", get("/jogo/espn:bra.1:1", "navigate")))).toBe("rede:/jogo/espn:bra.1:1");
    expect(w.caches.stores.get(NAMES.PAGES)?.has(`${ORIGIN}/jogo/espn:bra.1:1`)).toBe(true);
  });

  it("sem rede, entrega a cópia da MESMA página", async () => {
    const w = sw();
    await w.dispatch("install");
    network = async () => ok("jogo 1x1");
    await w.dispatch("fetch", get("/jogo/espn:bra.1:1", "navigate"));
    await new Promise((r) => setTimeout(r, 0));
    network = async () => Promise.reject(new TypeError("offline"));
    expect(await text(await w.dispatch("fetch", get("/jogo/espn:bra.1:1", "navigate")))).toBe("jogo 1x1");
  });

  it("sem rede e sem cópia daquela página, mostra a página offline", async () => {
    const w = sw();
    await w.dispatch("install");
    network = async () => Promise.reject(new TypeError("offline"));
    expect(await text(await w.dispatch("fetch", get("/time/espn:874", "navigate")))).toBe("página offline");
  });

  it("a página offline nunca é descartada, mesmo com o cache de páginas cheio", async () => {
    const w = sw();
    await w.dispatch("install");
    for (let i = 0; i < 40; i++) {
      await w.dispatch("fetch", get(`/jogo/espn:bra.1:${i}`, "navigate"));
      await new Promise((r) => setTimeout(r, 0));
    }
    await new Promise((r) => setTimeout(r, 10));
    const keys = [...(w.caches.stores.get(NAMES.PAGES)?.keys() ?? [])];
    expect(keys).toContain(`${ORIGIN}/offline`);
    expect(keys.length).toBeLessThanOrEqual(31); // 30 páginas + a offline
  });

  it("sem rede e sem página offline instalada, ainda responde (503) em vez de quebrar", async () => {
    const w = sw(); // sem install
    network = async () => Promise.reject(new TypeError("offline"));
    const res = await (await w.dispatch("fetch", get("/", "navigate"))).responded!;
    expect(res.status).toBe(503);
  });
});

describe("avisos (push)", () => {
  const pushWith = (data: unknown) => ({ data: { json: () => data } });
  const payload = { title: "Gol do Corinthians!", body: "Corinthians 1 x 0 Vitoria", tag: "placar:espn:bra.1:1", url: "/jogo/espn:bra.1:1", renotify: true };

  it("mostra a notificação com título, corpo, ícone, tag e o caminho para abrir", async () => {
    const w = sw();
    await w.dispatch("push", undefined, pushWith(payload));
    expect(w.showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = w.showNotification.mock.calls[0];
    expect(title).toBe("Gol do Corinthians!");
    expect(options).toMatchObject({ body: "Corinthians 1 x 0 Vitoria", tag: "placar:espn:bra.1:1", renotify: true, icon: "/pwa-icon/192", lang: "pt-BR", data: { url: "/jogo/espn:bra.1:1" } });
  });

  it("sem tag, não manda 'renotify' (o navegador recusaria a notificação inteira)", async () => {
    const w = sw();
    await w.dispatch("push", undefined, pushWith({ title: "x", body: "y", renotify: true }));
    const [, options] = w.showNotification.mock.calls[0];
    expect(options).not.toHaveProperty("tag");
    expect(options).not.toHaveProperty("renotify");
  });

  it("push sem corpo, com corpo quebrado ou fora do formato ainda mostra uma notificação (o navegador exige)", async () => {
    for (const extra of [{}, { data: { json: () => { throw new SyntaxError("x"); } } }, pushWith("texto solto"), pushWith(null), pushWith(42), pushWith({ title: 7, body: {} })]) {
      const w = sw();
      await w.dispatch("push", undefined, extra);
      expect(w.showNotification, JSON.stringify(extra)).toHaveBeenCalledTimes(1);
      expect(w.showNotification.mock.calls[0][0]).toBe("Placar");
    }
  });

  it("limita o tamanho do texto", async () => {
    const w = sw();
    await w.dispatch("push", undefined, pushWith({ title: "t".repeat(500), body: "b".repeat(900) }));
    const [title, options] = w.showNotification.mock.calls[0];
    expect(title).toHaveLength(120);
    expect((options as { body: string }).body).toHaveLength(240);
  });

  it("o aviso nunca abre outro site: só caminhos dentro do app", async () => {
    for (const url of ["https://evil.com/x", "//evil.com/x", "/\\evil.com", "javascript:alert(1)", "jogo/1", 5, undefined]) {
      const w = sw();
      await w.dispatch("push", undefined, pushWith({ title: "x", url }));
      expect((w.showNotification.mock.calls[0][1] as { data: { url: string } }).data.url, String(url)).toBe("/");
    }
  });

  const click = (w: ReturnType<typeof sw>, url: unknown) => {
    const close = vi.fn();
    return { close, done: w.dispatch("notificationclick", undefined, { notification: { close, data: { url } } }) };
  };

  it("tocar fecha o aviso e, com o app aberto, foca a janela e leva até o jogo", async () => {
    const w = sw();
    const client: FakeClient = { url: `${ORIGIN}/`, focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) };
    w.windows.push({ url: "https://outro-site.com/", focus: vi.fn(async () => undefined) }, client);
    const { close, done } = click(w, "/jogo/espn:bra.1:1");
    await done;
    expect(close).toHaveBeenCalled();
    expect(client.focus).toHaveBeenCalled();
    expect(client.navigate).toHaveBeenCalledWith(`${ORIGIN}/jogo/espn:bra.1:1`);
    expect(w.openWindow).not.toHaveBeenCalled();
  });

  it("com o app fechado, abre uma janela nova no jogo", async () => {
    const w = sw();
    await click(w, "/jogo/espn:bra.1:1").done;
    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/jogo/espn:bra.1:1`);
  });

  it("janela que não aceita foco: abre uma nova em vez de falhar", async () => {
    const w = sw();
    w.windows.push({ url: `${ORIGIN}/`, focus: vi.fn(async () => Promise.reject(new Error("sem foco"))) });
    await click(w, "/").done;
    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it("caminho de fora nas notificações já criadas vira a página inicial", async () => {
    const w = sw();
    await click(w, "https://evil.com/").done;
    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });
});
