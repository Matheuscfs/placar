import { createHash } from "node:crypto";
import type { PushSubscriptionJson } from "./types";

/**
 * O `endpoint` é uma URL que NÓS vamos chamar pelo servidor. Se aceitássemos qualquer uma, a rota de
 * inscrição viraria um jeito de fazer o servidor chamar endereços à escolha de quem envia (SSRF). Por
 * isso só passam os serviços de push reais dos navegadores, sempre em https.
 */
const PUSH_HOSTS: Array<string | RegExp> = [
  "fcm.googleapis.com", // Chrome, Edge, Opera, Brave, Samsung (Android e desktop)
  "updates.push.services.mozilla.com", // Firefox
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  "web.push.apple.com", // Safari / iOS (PWA instalado)
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge legado / Windows
];

const MAX_ENDPOINT = 2048;
const MAX_KEY = 256;
const B64URL = /^[A-Za-z0-9_-]+$/;

export const MAX_TEAMS = 60;
const MAX_TEAM_KEY = 80;

export function isAllowedEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > MAX_ENDPOINT) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  return PUSH_HOSTS.some((h) => (typeof h === "string" ? url.hostname === h : h.test(url.hostname)));
}

/** Valida e normaliza o que veio do navegador. Devolve `null` se algo estiver fora do formato. */
export function parseSubscription(raw: unknown): PushSubscriptionJson | null {
  if (!raw || typeof raw !== "object") return null;
  const { endpoint, keys } = raw as { endpoint?: unknown; keys?: unknown };
  if (!isAllowedEndpoint(endpoint) || !keys || typeof keys !== "object") return null;
  const { p256dh, auth } = keys as { p256dh?: unknown; auth?: unknown };
  const ok = (k: unknown): k is string => typeof k === "string" && k.length > 0 && k.length <= MAX_KEY && B64URL.test(k);
  if (!ok(p256dh) || !ok(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** Lista de chaves de times: sem repetidas, sem vazias, no máximo `MAX_TEAMS`. `null` se não for uma lista de textos. */
export function parseTeamKeys(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const keys: string[] = [];
  for (const k of raw) {
    if (typeof k !== "string") return null;
    if (k.length > 0 && k.length <= MAX_TEAM_KEY && !keys.includes(k)) keys.push(k);
  }
  return keys.slice(0, MAX_TEAMS);
}

export const subscriberId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");
