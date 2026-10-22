// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PushToggle } from "@/components/push-toggle";
import { detectPushSupport, disablePush, enablePush, fetchPushConfig, PushClientError, syncPush, urlBase64ToUint8Array } from "./push-client";

// Chave VAPID pública de mentira (65 bytes em base64url): o formato é o que importa.
const KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const keyBytes = urlBase64ToUint8Array(KEY);

type Perm = "default" | "granted" | "denied";
interface FakeSub {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  toJSON: () => unknown;
  unsubscribe: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
}
const makeSub = (key: Uint8Array | null = keyBytes, endpoint = "https://fcm.googleapis.com/fcm/send/abc"): FakeSub => ({
  endpoint,
  options: { applicationServerKey: key ? (key.buffer.slice(0) as ArrayBuffer) : null },
  toJSON: () => ({ endpoint, keys: { p256dh: "p", auth: "a" } }),
  unsubscribe: vi.fn(async () => true),
});

let permission: Perm;
let existing: FakeSub | null;
let subscribe: ReturnType<typeof vi.fn<(opts: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => Promise<FakeSub>>>;
let requestPermission: ReturnType<typeof vi.fn<() => Promise<Perm>>>;
let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
let serverConfig: Response | Error;
let serverReply: (url: string) => Response;
let swReady: Promise<unknown>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").map(([url, init]) => ({ url, body: JSON.parse(init!.body as string) }));

function installBrowser({ withApis = true } = {}) {
  if (!withApis) return;
  const registration = {
    pushManager: {
      getSubscription: vi.fn(async () => existing),
      subscribe: (opts: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }) => subscribe(opts),
    },
  };
  swReady = Promise.resolve(registration);
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { get ready() { return swReady; }, getRegistration: async () => registration } });
  vi.stubGlobal("PushManager", class {});
  const FakeNotification = Object.assign(function () {}, { requestPermission });
  Object.defineProperty(FakeNotification, "permission", { get: () => permission }); // getter vivo (Object.assign congelaria o valor)
  vi.stubGlobal("Notification", FakeNotification);
}

beforeEach(() => {
  permission = "default";
  existing = null;
  subscribe = vi.fn(async () => (existing = makeSub()));
  requestPermission = vi.fn(async () => {
    permission = "granted";
    return permission;
  });
  serverConfig = json({ enabled: true, publicKey: KEY });
  serverReply = () => json({ ok: true });
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/push/config") {
      if (serverConfig instanceof Error) throw serverConfig;
      return serverConfig.clone();
    }
    return init?.method === "POST" ? serverReply(url) : json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  installBrowser();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("urlBase64ToUint8Array", () => {
  it("converte base64url (com - e _, sem preenchimento) em bytes", () => {
    expect([...urlBase64ToUint8Array("-_8")]).toEqual([0xfb, 0xff]);
    expect([...urlBase64ToUint8Array("AQID")]).toEqual([1, 2, 3]);
    expect(keyBytes).toHaveLength(65);
    expect(keyBytes[0]).toBe(0x04); // ponto não comprimido P-256
  });
});

describe("detectPushSupport", () => {
  it("com as APIs, 'supported'", () => {
    expect(detectPushSupport()).toBe("supported");
  });

  it("sem as APIs num navegador comum, 'unsupported'", () => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
    expect(detectPushSupport()).toBe("unsupported");
  });

  it("iPhone sem as APIs e fora do app instalado → 'needs-install'; instalado → 'unsupported'", () => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1");
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(detectPushSupport()).toBe("needs-install");
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(detectPushSupport()).toBe("unsupported");
    vi.restoreAllMocks();
  });
});

describe("fetchPushConfig", () => {
  it("ligado, desligado, sem chave, erro HTTP e rede fora", async () => {
    expect(await fetchPushConfig()).toEqual({ enabled: true, publicKey: KEY });
    serverConfig = json({ enabled: false });
    expect(await fetchPushConfig()).toEqual({ enabled: false });
    serverConfig = json({ enabled: true });
    expect(await fetchPushConfig()).toEqual({ enabled: false });
    serverConfig = json({}, 500);
    expect(await fetchPushConfig()).toBeNull();
    serverConfig = new TypeError("Failed to fetch");
    expect(await fetchPushConfig()).toBeNull();
  });
});

describe("enablePush", () => {
  it("permissão negada: devolve 'denied' e não inscreve nem fala com o servidor", async () => {
    requestPermission.mockResolvedValueOnce("denied");
    expect(await enablePush(KEY, ["corinthians"])).toBe("denied");
    expect(subscribe).not.toHaveBeenCalled();
    expect(posts()).toEqual([]);
  });

  it("concedida: inscreve com userVisibleOnly e a chave do servidor, e registra com os times", async () => {
    expect(await enablePush(KEY, ["corinthians", "vitoria"])).toBe("on");
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0][0].userVisibleOnly).toBe(true);
    expect([...subscribe.mock.calls[0][0].applicationServerKey]).toEqual([...keyBytes]);
    expect(posts()).toEqual([{ url: "/api/push/subscribe", body: { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } }, teams: ["corinthians", "vitoria"] } }]);
  });

  it("já inscrito com a mesma chave: reaproveita, sem criar outra", async () => {
    existing = makeSub();
    await enablePush(KEY, []);
    expect(subscribe).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(1);
  });

  it("inscrito com OUTRA chave (servidor trocou as chaves): cancela a antiga e cria a nova", async () => {
    const old = makeSub(new Uint8Array(65).fill(7));
    existing = old;
    await enablePush(KEY, []);
    expect(old.unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("servidor recusou: desfaz a inscrição recém-criada e mostra a mensagem do servidor", async () => {
    serverReply = () => json({ error: { code: "push_full", message: "Não é possível aceitar novas inscrições agora." } }, 503);
    await expect(enablePush(KEY, [])).rejects.toThrow("Não é possível aceitar novas inscrições agora.");
    expect(existing?.unsubscribe).toHaveBeenCalled();
  });

  it("servidor recusou mas a inscrição já existia: não a apaga", async () => {
    const mine = makeSub();
    existing = mine;
    serverReply = () => json({}, 500);
    await expect(enablePush(KEY, [])).rejects.toBeInstanceOf(PushClientError);
    expect(mine.unsubscribe).not.toHaveBeenCalled();
  });

  it("o navegador não conseguiu inscrever: erro em português", async () => {
    subscribe.mockRejectedValueOnce(new DOMException("push service error", "AbortError"));
    await expect(enablePush(KEY, [])).rejects.toThrow(/não conseguiu ativar/i);
    expect(posts()).toEqual([]);
  });

  it("rede fora ao registrar: erro claro", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (url === "/api/push/config") return json({});
      throw new TypeError("Failed to fetch");
    });
    await expect(enablePush(KEY, [])).rejects.toThrow(/sem conexão/i);
  });

  it("service worker que nunca fica pronto (next dev): erro explicando, sem travar", async () => {
    vi.useFakeTimers();
    swReady = new Promise(() => undefined);
    const result = enablePush(KEY, []).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await result).toMatchObject({ message: expect.stringMatching(/app publicado/i) });
  });
});

describe("disablePush e syncPush", () => {
  it("desligar: avisa o servidor e cancela no navegador", async () => {
    const mine = (existing = makeSub());
    await disablePush();
    expect(posts()).toEqual([{ url: "/api/push/unsubscribe", body: { endpoint: mine.endpoint } }]);
    expect(mine.unsubscribe).toHaveBeenCalled();
  });

  it("desligar com o servidor fora do ar: cancela no aparelho mesmo assim", async () => {
    const mine = (existing = makeSub());
    serverReply = () => json({}, 500);
    await expect(disablePush()).resolves.toBeUndefined();
    expect(mine.unsubscribe).toHaveBeenCalled();
  });

  it("sem inscrição, desligar e sincronizar não fazem nada", async () => {
    await disablePush();
    await syncPush(["a"]);
    expect(posts()).toEqual([]);
  });

  it("sincronizar reenvia inscrição e times", async () => {
    existing = makeSub();
    await syncPush(["palmeiras"]);
    expect(posts()[0].body).toMatchObject({ teams: ["palmeiras"], subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc" } });
  });
});

describe("PushToggle", () => {
  const sw = () => screen.findByRole("switch");

  it("servidor sem avisos ligados: não mostra nada", async () => {
    serverConfig = json({ enabled: false });
    const { container } = render(<PushToggle teamKeys={["corinthians"]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it("servidor fora do ar na checagem: não mostra nada (e não quebra)", async () => {
    serverConfig = new TypeError("Failed to fetch");
    const { container } = render(<PushToggle teamKeys={[]} />);
    await act(async () => undefined);
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it("navegador sem suporte: explica", async () => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "serviceWorker");
    render(<PushToggle teamKeys={[]} />);
    expect(await screen.findByText(/não oferece avisos/i)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("permissão já negada no navegador: explica como liberar, sem interruptor", async () => {
    permission = "denied";
    render(<PushToggle teamKeys={[]} />);
    expect(await screen.findByText(/bloqueados neste navegador/i)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("desligado → toque → permissão → ligado, e o servidor recebe os times", async () => {
    render(<PushToggle teamKeys={["corinthians"]} />);
    const toggle = await sw();
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleName("Jogos dos seus times");

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(posts().at(-1)).toMatchObject({ url: "/api/push/subscribe", body: { teams: ["corinthians"] } });
  });

  it("já inscrito: abre ligado, e desligar cancela", async () => {
    existing = makeSub();
    render(<PushToggle teamKeys={[]} />);
    const toggle = await sw();
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(posts().some((p) => p.url === "/api/push/unsubscribe")).toBe(true);
  });

  it("recusou a permissão: vira 'bloqueado', sem erro vermelho", async () => {
    requestPermission.mockImplementationOnce(async () => (permission = "denied"));
    render(<PushToggle teamKeys={[]} />);
    fireEvent.click(await sw());
    expect(await screen.findByText(/bloqueados neste navegador/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falha ao ligar: mostra o erro (role=alert) e o interruptor continua desligado e liberado", async () => {
    serverReply = () => json({ error: { code: "x", message: "Servidor ocupado." } }, 503);
    render(<PushToggle teamKeys={[]} />);
    const toggle = await sw();
    fireEvent.click(toggle);
    expect(await screen.findByRole("alert")).toHaveTextContent("Servidor ocupado.");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toBeEnabled();
  });

  it("sem times favoritos, avisa que é preciso favoritar um", async () => {
    render(<PushToggle teamKeys={[]} />);
    await sw();
    expect(screen.getByText(/favorite um time/i)).toBeInTheDocument();
  });

  it("ligado: reenvia ao abrir e quando a lista de times muda (espera 0,8 s para juntar cliques)", async () => {
    existing = makeSub();
    vi.useFakeTimers();
    const { rerender } = render(<PushToggle teamKeys={["a"]} />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    await act(async () => void (await vi.advanceTimersByTimeAsync(800)));
    expect(posts().map((p) => p.body.teams)).toEqual([["a"]]);

    rerender(<PushToggle teamKeys={["a", "b"]} />);
    rerender(<PushToggle teamKeys={["a", "b", "c"]} />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(799)));
    expect(posts()).toHaveLength(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));
    expect(posts().map((p) => p.body.teams)).toEqual([["a"], ["a", "b", "c"]]);
  });
});
