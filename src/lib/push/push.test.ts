import { createECDH, randomBytes } from "node:crypto";
import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, todayIso } from "@/lib/domain/dates";
import type { Match, MatchStatus } from "@/lib/domain/types";
import { runPushCheck } from "./check";
import { detectEvents, snapshotOf } from "./detect";
import { buildNotification } from "./messages";
import { WebPushSender } from "./sender";
import { MAX_MEMORY_SUBSCRIBERS, MemoryPushStore } from "./store";
import { isAllowedEndpoint, MAX_TEAMS, parseSubscription, parseTeamKeys, subscriberId } from "./subscription";
import type { MatchSnapshot, NotificationPayload, PushSender, PushSubscriber, PushSubscriptionJson, SendResult } from "./types";
import { getVapidConfig } from "./vapid";

const NOW = new Date("2026-10-22T22:00:00Z");

const team = (key: string, shortName = key[0].toUpperCase() + key.slice(1)) => ({ id: `espn:${key}`, key, name: shortName, shortName, abbr: key.slice(0, 3).toUpperCase() });

function match(over: { id?: string; status?: MatchStatus; home?: number | null; away?: number | null; homeKey?: string; awayKey?: string; round?: string | null } = {}): Match {
  return {
    id: over.id ?? "espn:bra.1:1",
    source: "espn",
    leagueId: "brasileirao-a",
    season: "2026",
    round: over.round === undefined ? null : over.round,
    kickoff: "2026-10-22T22:00:00Z",
    status: over.status ?? "live",
    statusText: null,
    clock: null,
    home: { team: team(over.homeKey ?? "corinthians"), score: over.home === undefined ? 0 : over.home, penalties: null, aggregate: null },
    away: { team: team(over.awayKey ?? "vitoria"), score: over.away === undefined ? 0 : over.away, penalties: null, aggregate: null },
    venue: null,
  };
}

const snap = (status: MatchStatus, home: number | null, away: number | null): MatchSnapshot => ({ status, home, away, seenAt: NOW.toISOString() });
const kinds = (prev: MatchSnapshot | undefined, m: Match) => detectEvents(prev, m).map((e) => e.kind);

describe("detectEvents", () => {
  it("primeira vez que vê o jogo: nunca avisa, em nenhum estado", () => {
    for (const status of ["scheduled", "live", "halftime", "finished"] as const) expect(kinds(undefined, match({ status, home: 2, away: 1 }))).toEqual([]);
  });

  it("agendado → ao vivo: 'start'", () => {
    expect(kinds(snap("scheduled", null, null), match({ status: "live", home: 0, away: 0 }))).toEqual(["start"]);
  });

  it("começou e já saiu gol entre duas checagens: 'start' e 'goal'", () => {
    expect(kinds(snap("scheduled", null, null), match({ status: "live", home: 1, away: 0 }))).toEqual(["start", "goal"]);
  });

  it("gol do mandante e do visitante", () => {
    expect(kinds(snap("live", 0, 0), match({ home: 1, away: 0 }))).toEqual(["goal"]);
    expect(kinds(snap("live", 1, 0), match({ home: 1, away: 1 }))).toEqual(["goal"]);
  });

  it("dois gols entre duas checagens viram UM aviso", () => {
    expect(kinds(snap("live", 0, 0), match({ home: 2, away: 0 }))).toEqual(["goal"]);
  });

  it("placar igual, ou que diminuiu (gol anulado), não avisa", () => {
    expect(kinds(snap("live", 1, 0), match({ home: 1, away: 0 }))).toEqual([]);
    expect(kinds(snap("live", 1, 0), match({ home: 0, away: 0 }))).toEqual([]);
  });

  it("intervalo → segundo tempo não é 'start' de novo, e gol no intervalo→2º tempo conta", () => {
    expect(kinds(snap("halftime", 0, 0), match({ status: "live", home: 0, away: 0 }))).toEqual([]);
    expect(kinds(snap("live", 0, 0), match({ status: "halftime", home: 0, away: 0 }))).toEqual([]);
    expect(kinds(snap("halftime", 0, 0), match({ status: "live", home: 0, away: 1 }))).toEqual(["goal"]);
  });

  it("encerrou: só 'end' (o gol final já está no placar do fim de jogo)", () => {
    expect(kinds(snap("live", 1, 1), match({ status: "finished", home: 2, away: 1 }))).toEqual(["end"]);
  });

  it("agendado → encerrado direto (job ficou parado): só 'end', sem 'start' nem 'goal' atrasados", () => {
    expect(kinds(snap("scheduled", null, null), match({ status: "finished", home: 3, away: 0 }))).toEqual(["end"]);
  });

  it("jogo já encerrado não avisa mais, nem se a fonte oscilar de status", () => {
    expect(kinds(snap("finished", 2, 1), match({ status: "finished", home: 2, away: 1 }))).toEqual([]);
    expect(kinds(snap("finished", 2, 1), match({ status: "live", home: 3, away: 1 }))).toEqual([]);
  });

  it("adiado, suspenso e cancelado não avisam", () => {
    for (const status of ["postponed", "suspended", "canceled"] as const) expect(kinds(snap("scheduled", null, null), match({ status, home: null, away: null }))).toEqual([]);
  });

  it("jogo rolando com placar ausente (dado ruim da fonte) não vira gol", () => {
    expect(kinds(snap("live", 1, 0), match({ home: null, away: null }))).toEqual([]);
    expect(kinds(snap("live", null, null), match({ home: 1, away: 0 }))).toEqual([]);
  });

  it("o evento traz as chaves dos dois times (define o público)", () => {
    expect(detectEvents(snap("live", 0, 0), match({ home: 1 }))[0]).toMatchObject({ matchId: "espn:bra.1:1", teamKeys: ["corinthians", "vitoria"] });
  });
});

describe("buildNotification", () => {
  it("gol do mandante / do visitante / dos dois", () => {
    const g = detectEvents(snap("live", 0, 0), match({ home: 1, away: 0 }))[0];
    expect(buildNotification(g, match({ home: 1, away: 0 }), snap("live", 0, 0))).toMatchObject({ title: "Gol do Corinthians!", body: "Corinthians 1 x 0 Vitoria", renotify: true });
    expect(buildNotification(g, match({ home: 1, away: 1 }), snap("live", 1, 0)).title).toBe("Gol do Vitoria!");
    expect(buildNotification(g, match({ home: 2, away: 0 }), snap("live", 1, 0)).title).toBe("Gol do Corinthians!");
    expect(buildNotification(g, match({ home: 2, away: 1 }), snap("live", 1, 0)).title).toBe("Gol!"); // os dois marcaram entre checagens
    expect(buildNotification(g, match({ home: 1, away: 1 }), snap("live", 0, 0)).title).toBe("Gol!");
  });

  it("início e fim, com a rodada quando houver; aponta para a página do jogo; um 'tag' por jogo", () => {
    const m = match({ home: 2, away: 1, round: "Rodada 31" });
    const start = buildNotification({ kind: "start", matchId: m.id, teamKeys: ["a", "b"] }, m);
    const end = buildNotification({ kind: "end", matchId: m.id, teamKeys: ["a", "b"] }, m);
    expect(start).toMatchObject({ title: "Começou: Corinthians x Vitoria", body: "Bola rolando. · Rodada 31", url: "/jogo/espn:bra.1:1", renotify: false });
    expect(end).toMatchObject({ title: "Fim de jogo", body: "Corinthians 2 x 1 Vitoria · Rodada 31" });
    expect(start.tag).toBe(end.tag);
  });

  it("a url nunca sai do app", () => {
    expect(buildNotification({ kind: "end", matchId: "x", teamKeys: ["a", "b"] }, match()).url.startsWith("/")).toBe(true);
  });
});

describe("validação da inscrição", () => {
  const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", keys: { p256dh: "BNc-_abc123", auth: "xyz_-123" } };

  it("aceita os serviços de push reais", () => {
    for (const e of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QAbc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) expect(isAllowedEndpoint(e), e).toBe(true);
  });

  it("recusa SSRF: http, hosts internos, host parecido, credenciais, porta e lixo", () => {
    for (const e of [
      "http://fcm.googleapis.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evil.com/fcm.googleapis.com",
      "https://user:pass@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "ftp://fcm.googleapis.com/x",
      "not a url",
      "",
      42,
      null,
      `https://fcm.googleapis.com/${"a".repeat(2100)}`,
    ]) expect(isAllowedEndpoint(e as unknown), String(e).slice(0, 50)).toBe(false);
  });

  it("parseSubscription devolve só o necessário e rejeita chaves ruins", () => {
    expect(parseSubscription({ ...good, extra: "ignorado", expirationTime: null })).toEqual(good);
    expect(parseSubscription(null)).toBeNull();
    expect(parseSubscription({ endpoint: good.endpoint })).toBeNull();
    expect(parseSubscription({ endpoint: good.endpoint, keys: { p256dh: "", auth: "a" } })).toBeNull();
    expect(parseSubscription({ endpoint: good.endpoint, keys: { p256dh: "com espaço", auth: "a" } })).toBeNull();
    expect(parseSubscription({ endpoint: good.endpoint, keys: { p256dh: "a".repeat(300), auth: "a" } })).toBeNull();
    expect(parseSubscription({ endpoint: "https://evil.com/x", keys: good.keys })).toBeNull();
  });

  it("parseTeamKeys: tira repetidas/vazias, limita e recusa o que não for lista de textos", () => {
    expect(parseTeamKeys(["a", "a", "", "b"])).toEqual(["a", "b"]);
    expect(parseTeamKeys(["a", 1])).toBeNull();
    expect(parseTeamKeys("a")).toBeNull();
    expect(parseTeamKeys(["x".repeat(81)])).toEqual([]);
    expect(parseTeamKeys(Array.from({ length: 200 }, (_, i) => `t${i}`))).toHaveLength(MAX_TEAMS);
  });

  it("subscriberId é estável, não expõe o endpoint e muda com ele", () => {
    const a = subscriberId(good.endpoint);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(subscriberId(good.endpoint));
    expect(a).not.toContain("fcm");
    expect(a).not.toBe(subscriberId(`${good.endpoint}x`));
  });
});

const sub = (id: string, teams: string[]): PushSubscriber => ({
  id,
  subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: { p256dh: "p", auth: "a" } },
  teams,
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
});

describe("MemoryPushStore", () => {
  it("atualizar um inscrito mantém a data de criação", async () => {
    const s = new MemoryPushStore();
    await s.upsertSubscriber({ ...sub("a", ["x"]), createdAt: "2026-01-01T00:00:00Z" });
    await s.upsertSubscriber({ ...sub("a", ["y"]), createdAt: "2026-10-22T00:00:00Z", updatedAt: "2026-10-22T00:00:00Z" });
    const [only] = await s.listSubscribers();
    expect(only).toMatchObject({ teams: ["y"], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-10-22T00:00:00Z" });
  });

  it("remover, snapshots e limpeza dos antigos", async () => {
    const s = new MemoryPushStore();
    await s.upsertSubscriber(sub("a", []));
    await s.removeSubscriber("a");
    await s.removeSubscriber("não existe");
    expect(await s.listSubscribers()).toEqual([]);

    await s.saveSnapshots(new Map([["velho", { ...snap("finished", 1, 0), seenAt: "2026-10-01T00:00:00Z" }], ["novo", snap("live", 0, 0)]]));
    expect([...(await s.getSnapshots(["velho", "novo", "nada"])).keys()].sort()).toEqual(["novo", "velho"]);
    await s.pruneSnapshots("2026-10-10T00:00:00Z");
    expect([...(await s.getSnapshots(["velho", "novo"])).keys()]).toEqual(["novo"]);
  });

  it(`recusa novos inscritos acima de ${MAX_MEMORY_SUBSCRIBERS}, mas ainda atualiza os que já existem`, async () => {
    const s = new MemoryPushStore();
    for (let i = 0; i < MAX_MEMORY_SUBSCRIBERS; i++) await s.upsertSubscriber(sub(`s${i}`, []));
    await expect(s.upsertSubscriber(sub("novo", []))).rejects.toThrow(/Limite/);
    await expect(s.upsertSubscriber(sub("s0", ["x"]))).resolves.toBeUndefined();
  });
});

describe("runPushCheck", () => {
  class FakeSender implements PushSender {
    sent: Array<{ endpoint: string; payload: NotificationPayload }> = [];
    results = new Map<string, SendResult>();
    async send(s: PushSubscriptionJson, payload: NotificationPayload): Promise<SendResult> {
      this.sent.push({ endpoint: s.endpoint, payload });
      return this.results.get(s.endpoint) ?? "sent";
    }
  }

  const todayDate = todayIso(NOW);
  let lists: Record<string, Match[] | Error>;
  const orchestrator = {
    getMatchesByDate: vi.fn(async (date: string) => {
      const l = lists[date] ?? [];
      if (l instanceof Error) throw l;
      return { data: l, meta: {} as never };
    }),
  };

  let store: MemoryPushStore;
  let sender: FakeSender;
  const run = (now = NOW) => runPushCheck({ orchestrator, store, sender, now });
  const endpointOf = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`;

  beforeEach(async () => {
    lists = {};
    orchestrator.getMatchesByDate.mockClear();
    store = new MemoryPushStore();
    sender = new FakeSender();
    await store.upsertSubscriber(sub("ana", ["corinthians"]));
  });

  it("sem inscritos (ou sem favoritos), nem consulta as fontes", async () => {
    store = new MemoryPushStore();
    expect(await run()).toMatchObject({ skipped: "no_subscribers", subscribers: 0 });
    await store.upsertSubscriber(sub("zé", []));
    expect(await run()).toMatchObject({ skipped: "no_favorites", subscribers: 1 });
    expect(orchestrator.getMatchesByDate).not.toHaveBeenCalled();
  });

  it("primeira checagem só guarda a referência; a seguinte avisa o gol, uma vez só", async () => {
    lists[todayDate] = [match({ status: "live", home: 0, away: 0 })];
    expect(await run()).toMatchObject({ watchedMatches: 1, baselined: 1, events: 0, sent: 0 });

    lists[todayDate] = [match({ status: "live", home: 1, away: 0 })];
    expect(await run()).toMatchObject({ baselined: 0, events: 1, sent: 1 });
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({ endpoint: endpointOf("ana"), payload: { title: "Gol do Corinthians!" } });

    // Mesma situação de novo: nada a avisar.
    expect(await run()).toMatchObject({ events: 0, sent: 0 });
    expect(sender.sent).toHaveLength(1);
  });

  it("avisa só quem favoritou um dos dois times, e jogos de outros times nem são olhados", async () => {
    await store.upsertSubscriber(sub("bia", ["vitoria"]));
    await store.upsertSubscriber(sub("caio", ["palmeiras"]));
    lists[todayDate] = [match({ status: "scheduled", home: null, away: null }), match({ id: "outro", homeKey: "palmeiras", awayKey: "santos", status: "scheduled", home: null, away: null })];
    await run();
    lists[todayDate] = [match({ status: "live", home: 0, away: 0 }), match({ id: "outro", homeKey: "santos", awayKey: "gremio", status: "live", home: 0, away: 0 })];
    const r = await run();
    expect(r.watchedMatches).toBe(1); // o jogo do Palmeiras virou Santos x Grêmio: ninguém favoritou
    expect(sender.sent.map((s) => s.endpoint).sort()).toEqual([endpointOf("ana"), endpointOf("bia")]);
    expect(sender.sent.every((s) => s.payload.title === "Começou: Corinthians x Vitoria")).toBe(true);
  });

  it("jogo de ontem que acabou depois da meia-noite também é acompanhado", async () => {
    const yesterday = addDays(todayDate, -1);
    lists[yesterday] = [match({ status: "live", home: 1, away: 1 })];
    await run();
    lists[yesterday] = [match({ status: "finished", home: 2, away: 1 })];
    expect(await run()).toMatchObject({ events: 1, sent: 1 });
    expect(sender.sent[0].payload.title).toBe("Fim de jogo");
  });

  it("aparelho que cancelou (410) é removido; falha comum só é contada, e o aviso NÃO é repetido", async () => {
    await store.upsertSubscriber(sub("bia", ["corinthians"]));
    await store.upsertSubscriber(sub("caio", ["corinthians"]));
    sender.results.set(endpointOf("bia"), "gone");
    sender.results.set(endpointOf("caio"), "failed");
    lists[todayDate] = [match({ status: "live", home: 0, away: 0 })];
    await run();
    lists[todayDate] = [match({ status: "live", home: 1, away: 0 })];
    expect(await run()).toMatchObject({ sent: 1, removed: 1, failed: 1 });
    expect((await store.listSubscribers()).map((s) => s.id).sort()).toEqual(["ana", "caio"]);

    sender.sent = [];
    expect(await run()).toMatchObject({ events: 0 });
    expect(sender.sent).toEqual([]);
  });

  it("sem a lista de hoje dá erro e NÃO mexe nos snapshots; sem a de ontem, segue", async () => {
    lists[todayDate] = [match({ status: "live", home: 0, away: 0 })];
    await run();

    lists[todayDate] = new Error("fontes fora");
    await expect(run()).rejects.toThrow("fontes fora");

    lists[todayDate] = [match({ status: "live", home: 1, away: 0 })];
    lists[addDays(todayDate, -1)] = new Error("ontem falhou");
    expect(await run()).toMatchObject({ events: 1, sent: 1 }); // a referência anterior seguia valendo
  });

  it("esquece jogos antigos (3 dias)", async () => {
    await store.saveSnapshots(new Map([["velho", { ...snap("finished", 1, 0), seenAt: new Date(NOW.getTime() - 4 * 24 * 3600 * 1000).toISOString() }]]));
    lists[todayDate] = [match({ status: "scheduled", home: null, away: null })];
    await run();
    expect((await store.getSnapshots(["velho"])).size).toBe(0);
  });

  it("snapshotOf guarda status, placar e a hora", () => {
    expect(snapshotOf(match({ status: "live", home: 2, away: 1 }), NOW)).toEqual({ status: "live", home: 2, away: 1, seenAt: NOW.toISOString() });
  });
});

describe("getVapidConfig", () => {
  const KEYS = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  const set = (pub: string, priv: string, subject: string) => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = pub;
    process.env.VAPID_PRIVATE_KEY = priv;
    process.env.VAPID_SUBJECT = subject;
  };

  it("sem variáveis, desligado; com as três (mailto ou https), ligado", () => {
    set("", "", "");
    expect(getVapidConfig()).toBeNull();
    set("pub", "priv", "mailto:dono@exemplo.com");
    expect(getVapidConfig()).toEqual({ publicKey: "pub", privateKey: "priv", subject: "mailto:dono@exemplo.com" });
    set("pub", "priv", "https://exemplo.com/contato");
    expect(getVapidConfig()).not.toBeNull();
  });

  it("faltando uma chave, ou com contato inválido, fica desligado", () => {
    set("pub", "", "mailto:a@b.co");
    expect(getVapidConfig()).toBeNull();
    set("", "priv", "mailto:a@b.co");
    expect(getVapidConfig()).toBeNull();
    set("pub", "priv", "voce@exemplo.com");
    expect(getVapidConfig()).toBeNull();
    set("pub", "priv", "http://exemplo.com");
    expect(getVapidConfig()).toBeNull();
  });
});

describe("WebPushSender (biblioteca web-push real, sem rede)", () => {
  const vapid = { ...webpush.generateVAPIDKeys(), subject: "mailto:dono@exemplo.com" };
  const browser = createECDH("prime256v1");
  browser.generateKeys();
  const subscription: PushSubscriptionJson = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    keys: { p256dh: browser.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") },
  };
  const payload: NotificationPayload = { title: "Gol do Corinthians!", body: "Corinthians 1 x 0 Vitoria", tag: "placar:x", url: "/jogo/x", renotify: true };
  afterEach(() => vi.restoreAllMocks());

  it("o pedido que a biblioteca monta vai criptografado (aes128gcm) e assinado com a chave VAPID", () => {
    const d = webpush.generateRequestDetails(subscription, JSON.stringify(payload), {
      vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      TTL: 120,
      urgency: "high",
    });
    expect(d.endpoint).toBe(subscription.endpoint);
    expect(d.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(Number(d.headers.TTL)).toBe(120);
    expect(d.headers.Urgency).toBe("high");
    expect(d.headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(Buffer.isBuffer(d.body)).toBe(true);
    expect(d.body.toString("utf8")).not.toContain("Gol do Corinthians"); // o texto não vai em claro
  });

  it("entregou → 'sent'; 404 e 410 → 'gone'; outros erros → 'failed'", async () => {
    const sender = new WebPushSender(vapid);
    const spy = vi.spyOn(webpush, "sendNotification");
    const err = (status: number) => new webpush.WebPushError("x", status, {}, "", subscription.endpoint);

    spy.mockResolvedValueOnce({ statusCode: 201, body: "", headers: {} });
    expect(await sender.send(subscription, payload)).toBe("sent");
    spy.mockRejectedValueOnce(err(410));
    expect(await sender.send(subscription, payload)).toBe("gone");
    spy.mockRejectedValueOnce(err(404));
    expect(await sender.send(subscription, payload)).toBe("gone");
    spy.mockRejectedValueOnce(err(500));
    expect(await sender.send(subscription, payload)).toBe("failed");
    spy.mockRejectedValueOnce(err(429));
    expect(await sender.send(subscription, payload)).toBe("failed");
    spy.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await sender.send(subscription, payload)).toBe("failed");
  });

  it("envia o JSON do aviso, com TTL curto, urgência alta e a identidade VAPID do servidor", async () => {
    const spy = vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    await new WebPushSender(vapid).send(subscription, payload);
    const [sentSub, body, options] = spy.mock.calls[0];
    expect(sentSub).toEqual(subscription);
    expect(JSON.parse(body as string)).toEqual(payload);
    expect(options).toMatchObject({ TTL: 120, urgency: "high", vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey } });
  });
});
