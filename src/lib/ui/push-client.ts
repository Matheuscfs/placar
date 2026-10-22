/**
 * Lado do navegador dos avisos (Web Push): detectar suporte, pedir permissão, inscrever o aparelho e
 * contar ao servidor quais times avisar. Só roda no cliente. O servidor está em `src/lib/push`.
 */

export type PushSupport = "supported" | "unsupported" | "needs-install";

export class PushClientError extends Error {}

/**
 * No iPhone/iPad, o Safari só oferece push a um site INSTALADO na tela de início. Antes disso as APIs
 * nem existem, então "sem API + iOS + fora do modo app" quer dizer "instale primeiro", e não "não dá".
 */
export function detectPushSupport(): PushSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "supported";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone ? "needs-install" : "unsupported";
}

/** A chave VAPID pública chega em base64url; o navegador quer bytes. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export interface PushServerConfig {
  enabled: boolean;
  publicKey?: string;
}

/** `null` quando o servidor não respondeu: a interface trata como "avisos indisponíveis". */
export async function fetchPushConfig(): Promise<PushServerConfig | null> {
  try {
    const res = await fetch("/api/push/config", { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as PushServerConfig;
    return j.enabled && typeof j.publicKey === "string" && j.publicKey ? { enabled: true, publicKey: j.publicKey } : { enabled: false };
  } catch {
    return null;
  }
}

/**
 * O service worker só é registrado na versão publicada (`npm run build`). Em `next dev` ele nunca
 * chega a "ready", então esperamos pouco e explicamos em vez de travar o botão.
 */
async function readyRegistration(timeoutMs = 6000): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new PushClientError("Os avisos precisam do app publicado (o service worker não está ativo).")), timeoutMs));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/** A inscrição atual deste aparelho, sem criar nenhuma. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

async function postJson(path: string, body: unknown): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new PushClientError("Sem conexão com o servidor. Tente de novo.");
  }
  if (!res.ok) {
    let message = "Não foi possível atualizar os avisos.";
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) message = j.error.message;
    } catch {
      /* corpo sem JSON: fica a mensagem padrão */
    }
    throw new PushClientError(message);
  }
}

const sameKey = (a: ArrayBuffer | null, b: Uint8Array) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);

/**
 * Liga os avisos: pede permissão (TEM que ser chamada direto de um toque do usuário, por isso a chave
 * pública já vem pronta, sem buscar nada antes), inscreve o aparelho e registra no servidor.
 * Devolve "denied" se a pessoa recusou; qualquer outra falha vira `PushClientError` em português.
 */
export async function enablePush(publicKey: string, teamKeys: string[]): Promise<"on" | "denied"> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "denied";

  const reg = await readyRegistration();
  const key = urlBase64ToUint8Array(publicKey);
  let subscription = await reg.pushManager.getSubscription();
  // Chaves do servidor trocaram: a inscrição antiga não serve mais e o navegador recusa criar outra por cima.
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  const created = !subscription;
  try {
    subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    throw new PushClientError("O navegador não conseguiu ativar os avisos. Tente de novo mais tarde.");
  }
  try {
    await postJson("/api/push/subscribe", { subscription: subscription.toJSON(), teams: teamKeys });
  } catch (e) {
    // Servidor não aceitou: não deixa uma inscrição solta no aparelho que ninguém vai usar.
    if (created) await subscription.unsubscribe().catch(() => undefined);
    throw e;
  }
  return "on";
}

/** Desliga: avisa o servidor e cancela no navegador. Se o servidor não responder, cancela mesmo assim. */
export async function disablePush(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  await postJson("/api/push/unsubscribe", { endpoint: subscription.endpoint }).catch(() => undefined);
  await subscription.unsubscribe();
}

/** Reenvia a lista de times (e re-registra o aparelho se o servidor tiver perdido o cadastro). */
export async function syncPush(teamKeys: string[]): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;
  await postJson("/api/push/subscribe", { subscription: subscription.toJSON(), teams: teamKeys });
}
