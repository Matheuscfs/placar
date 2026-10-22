import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cron } from "@/app/api/cron/push/route";
import { GET as getConfig } from "@/app/api/push/config/route";
import { POST as subscribe } from "@/app/api/push/subscribe/route";
import { POST as unsubscribe } from "@/app/api/push/unsubscribe/route";
import { MAX_MEMORY_SUBSCRIBERS, MemoryPushStore, setPushStoreForTests } from "@/lib/push/store";
import { subscriberId } from "@/lib/push/subscription";

const vapid = webpush.generateVAPIDKeys();
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";
const subscription = { endpoint: ENDPOINT, keys: { p256dh: "BNc-_abc123", auth: "xyz_-123" } };

const post = (path: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request(`http://localhost${path}`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const get = (path: string, headers: Record<string, string> = {}) => new Request(`http://localhost${path}`, { headers });

let store: MemoryPushStore;

function configure() {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", vapid.publicKey);
  vi.stubEnv("VAPID_PRIVATE_KEY", vapid.privateKey);
  vi.stubEnv("VAPID_SUBJECT", "mailto:dono@exemplo.com");
}

beforeEach(() => {
  store = new MemoryPushStore();
  setPushStoreForTests(store);
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
  vi.stubEnv("VAPID_PRIVATE_KEY", "");
  vi.stubEnv("VAPID_SUBJECT", "");
  vi.stubEnv("CRON_SECRET", "");
});
afterEach(() => {
  setPushStoreForTests(null);
  vi.unstubAllEnvs();
});

describe("GET /api/push/config", () => {
  it("desligado sem chaves; ligado entrega SÓ a chave pública", async () => {
    expect(await (await getConfig()).json()).toEqual({ enabled: false });
    configure();
    const body = await (await getConfig()).json();
    expect(body).toEqual({ enabled: true, publicKey: vapid.publicKey });
    expect(JSON.stringify(body)).not.toContain(vapid.privateKey);
  });

  it("nunca vai para o cache do CDN", async () => {
    expect((await getConfig()).headers.get("cache-control")).toBe("no-store");
  });
});

describe("POST /api/push/subscribe", () => {
  it("sem chaves VAPID: 503 'push_not_configured'", async () => {
    const res = await subscribe(post("/api/push/subscribe", { subscription, teams: [] }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("push_not_configured");
  });

  describe("configurado", () => {
    beforeEach(configure);

    it("registra o aparelho com a lista de times", async () => {
      const res = await subscribe(post("/api/push/subscribe", { subscription, teams: ["corinthians", "vitoria"] }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const [s] = await store.listSubscribers();
      expect(s).toMatchObject({ id: subscriberId(ENDPOINT), teams: ["corinthians", "vitoria"], subscription });
    });

    it("inscrever de novo atualiza os times em vez de duplicar", async () => {
      await subscribe(post("/api/push/subscribe", { subscription, teams: ["a"] }));
      await subscribe(post("/api/push/subscribe", { subscription, teams: ["b"] }));
      const all = await store.listSubscribers();
      expect(all).toHaveLength(1);
      expect(all[0].teams).toEqual(["b"]);
    });

    it("recusa endpoint fora dos serviços de push (SSRF) e não guarda nada", async () => {
      for (const endpoint of ["https://evil.com/x", "http://fcm.googleapis.com/x", "https://169.254.169.254/x"]) {
        const res = await subscribe(post("/api/push/subscribe", { subscription: { ...subscription, endpoint }, teams: [] }));
        expect(res.status, endpoint).toBe(400);
      }
      expect(await store.listSubscribers()).toEqual([]);
    });

    it("corpo inválido: não é JSON, tipo errado, grande demais, times mal formados", async () => {
      expect((await subscribe(post("/api/push/subscribe", "{não é json"))).status).toBe(400);
      expect((await subscribe(post("/api/push/subscribe", { subscription, teams: [] }, { "content-type": "text/plain" }))).status).toBe(415);
      expect((await subscribe(post("/api/push/subscribe", { subscription, teams: ["x".repeat(9000)] }))).status).toBe(413);
      expect((await subscribe(post("/api/push/subscribe", { subscription, teams: "corinthians" }))).status).toBe(400);
      expect((await subscribe(post("/api/push/subscribe", { subscription, teams: [1, 2] }))).status).toBe(400);
      expect((await subscribe(post("/api/push/subscribe", { teams: [] }))).status).toBe(400);
      expect((await subscribe(post("/api/push/subscribe", "null"))).status).toBe(400);
      expect(await store.listSubscribers()).toEqual([]);
    });

    it("repositório cheio: 503 'push_full' (sem erro 500)", async () => {
      const full = new MemoryPushStore();
      for (let i = 0; i < MAX_MEMORY_SUBSCRIBERS; i++) {
        await full.upsertSubscriber({ id: `s${i}`, subscription, teams: [], createdAt: "", updatedAt: "" });
      }
      setPushStoreForTests(full);
      const res = await subscribe(post("/api/push/subscribe", { subscription, teams: [] }));
      expect(res.status).toBe(503);
      expect((await res.json()).error.code).toBe("push_full");
    });
  });
});

describe("POST /api/push/unsubscribe", () => {
  beforeEach(configure);

  it("apaga o aparelho; repetir não é erro e não revela se existia", async () => {
    await subscribe(post("/api/push/subscribe", { subscription, teams: ["a"] }));
    expect((await unsubscribe(post("/api/push/unsubscribe", { endpoint: ENDPOINT }))).status).toBe(200);
    expect(await store.listSubscribers()).toEqual([]);
    const again = await unsubscribe(post("/api/push/unsubscribe", { endpoint: ENDPOINT }));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true });
  });

  it("recusa endpoint inválido e corpo sem JSON", async () => {
    expect((await unsubscribe(post("/api/push/unsubscribe", { endpoint: "https://evil.com/x" }))).status).toBe(400);
    expect((await unsubscribe(post("/api/push/unsubscribe", {}))).status).toBe(400);
    expect((await unsubscribe(post("/api/push/unsubscribe", { endpoint: ENDPOINT }, { "content-type": "text/plain" }))).status).toBe(415);
  });
});

describe("GET /api/cron/push", () => {
  it("em produção, sem CRON_SECRET a rota não existe (404)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await cron(get("/api/cron/push"))).status).toBe(404);
  });

  it("com CRON_SECRET: sem token, token errado e token quase certo → 401", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-do-job");
    configure();
    expect((await cron(get("/api/cron/push"))).status).toBe(401);
    expect((await cron(get("/api/cron/push", { authorization: "Bearer errado" }))).status).toBe(401);
    expect((await cron(get("/api/cron/push", { authorization: "Bearer segredo-do-jo" }))).status).toBe(401);
    expect((await cron(get("/api/cron/push", { authorization: "segredo-do-job" }))).status).toBe(401);
  });

  it("com o token certo mas sem chaves VAPID: 503 explicando o que falta", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-do-job");
    const res = await cron(get("/api/cron/push", { authorization: "Bearer segredo-do-job" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("push_not_configured");
  });

  it("autorizado e configurado, sem inscritos: responde o relatório sem consultar as fontes", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-do-job");
    configure();
    const res = await cron(get("/api/cron/push", { authorization: "Bearer segredo-do-job" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ skipped: "no_subscribers", subscribers: 0, sent: 0 });
  });
});
