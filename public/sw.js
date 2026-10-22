/*
 * Service worker do Placar. Escrito à mão (sem biblioteca) para ser curto e auditável.
 *
 * Estratégias:
 *  - /_next/static e ícones  → cache primeiro (são imutáveis: o nome do arquivo muda quando o conteúdo muda)
 *  - /api/* (menos /api/status) → rede primeiro; sem rede, o último dado bom. Placar velho é melhor
 *    que tela vazia, e a interface avisa que está sem conexão.
 *  - navegação (HTML)         → rede primeiro; sem rede, a última cópia da página ou /offline
 *  - outras origens (escudos) → não tocamos: o cache HTTP do navegador cuida
 *
 * Para publicar uma mudança nas regras, troque VERSION: os caches antigos são apagados na ativação.
 */
const VERSION = "v1";
const STATIC = `placar-static-${VERSION}`;
const API = `placar-api-${VERSION}`;
const PAGES = `placar-pages-${VERSION}`;
const OFFLINE_URL = "/offline";
const MAX_API_ENTRIES = 60;
const MAX_PAGE_ENTRIES = 30;
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, API, PAGES]);
      for (const key of await caches.keys()) {
        if (key.startsWith("placar-") && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/api/status" || url.pathname.startsWith("/api/cron/")) return; // operacional: nunca em cache

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API, MAX_API_ENTRIES, false));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/")) {
    event.respondWith(cacheFirst(request, STATIC));
  } else if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, PAGES, MAX_PAGE_ENTRIES, true));
  }
});

/*
 * Avisos (Web Push). O servidor manda JSON { title, body, tag, url, renotify } (ver src/lib/push).
 * O navegador EXIGE que todo push mostre uma notificação; por isso, mesmo com corpo vazio ou quebrado,
 * mostramos algo em vez de deixar o aviso morrer em silêncio.
 */
const NOTIFICATION_ICON = "/pwa-icon/192";

/** Só caminhos DENTRO do app: um aviso nunca pode abrir outro site. */
function safePath(raw) {
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  if (!data || typeof data !== "object") data = {};
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 120) : "Placar";
  const tag = typeof data.tag === "string" && data.tag ? data.tag.slice(0, 120) : undefined;
  const options = {
    body: typeof data.body === "string" ? data.body.slice(0, 240) : "",
    icon: NOTIFICATION_ICON,
    lang: "pt-BR",
    data: { url: safePath(data.url) },
  };
  if (tag) {
    options.tag = tag;
    options.renotify = data.renotify === true; // renotify só é válido junto de uma tag
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        try {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        } catch {
          /* janela que não aceita foco/navegação: abre uma nova abaixo */
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error) => (clearTimeout(timer), reject(error)),
    );
  });
}

async function networkFirst(request, cacheName, maxEntries, isNavigation) {
  const cache = await caches.open(cacheName);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (response.ok) {
      cache.put(request, response.clone()).then(() => trim(cache, maxEntries));
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isNavigation) {
      const offline = await (await caches.open(PAGES)).match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response(JSON.stringify({ error: { code: "offline", message: "Sem conexão." } }), {
      status: 503,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}

/** Mantém só as `max` entradas mais recentes (as chaves vêm na ordem de inserção). */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) {
    if (new URL(keys[i].url).pathname === OFFLINE_URL) continue; // a página offline fica sempre
    await cache.delete(keys[i]);
  }
}
