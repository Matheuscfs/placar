import { CACHE_MAX_ENTRIES } from "@/lib/config";

/** Quanto tempo (s) um dado servido velho é tratado como "fresco" pelo cliente: logo ele tenta de novo. */
const STALE_RETRY_SECONDS = 5;

export type CacheOutcome = "hit" | "miss" | "stale";

interface Entry {
  /** Presente em entrada normal. */
  value?: unknown;
  /** Presente em entrada negativa ("não existe"). */
  error?: unknown;
  storedAt: number;
  freshUntil: number;
  staleUntil: number;
}

/** O que o `fetcher` devolve: o dado e a política de cache DELE (que depende do conteúdo). */
export interface Fetched<T> {
  value: T;
  ttlSeconds: number;
  /** Janela extra, depois do TTL, em que o dado pode ser servido se a fonte falhar. */
  staleSeconds: number;
}

export interface Resolved<T> {
  value: T;
  state: CacheOutcome;
  /** Quando o dado foi buscado na fonte (ms desde a época). */
  fetchedAt: number;
  /** Por quanto tempo mais o cliente pode tratá-lo como fresco. */
  ttlSeconds: number;
  /** Quando `state === "stale"`: o erro da fonte que nos fez servir dado velho. */
  staleCause?: unknown;
}

export interface ResolveOptions {
  /** Se devolver um número, o erro é guardado por esse tempo (cache negativo) e repetido sem tocar a fonte. */
  negativeTtlSeconds?: (error: unknown) => number | null | undefined;
}

export interface TtlCacheOptions {
  now?: () => number;
  maxEntries?: number;
}

/**
 * Cache em memória por TTL, com três comportamentos pensados para não estourar a cota das fontes:
 *
 * 1. **Uma busca por chave de cada vez** (single-flight): 50 requisições simultâneas pelo mesmo
 *    jogo viram 1 chamada à fonte.
 * 2. **Stale-if-error**: se a fonte falha e há um dado bom dentro da janela de "velho", ele é
 *    servido (`state: "stale"`) em vez de erro.
 * 3. **Cache negativo**: "não existe" fica guardado por pouco tempo.
 *
 * É por instância do servidor: na Vercel cada função tem o seu cache (o CDN, via `Cache-Control`,
 * é a camada compartilhada). Quando o app crescer, o ponto de troca para Redis/Edge Config é esta classe.
 */
export class TtlCache {
  private readonly store = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<Resolved<unknown>>>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(opts: TtlCacheOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.maxEntries = opts.maxEntries ?? CACHE_MAX_ENTRIES;
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  async resolve<T>(key: string, fetcher: () => Promise<Fetched<T>>, opts: ResolveOptions = {}): Promise<Resolved<T>> {
    const now = this.now();
    const entry = this.store.get(key);

    if (entry && now < entry.freshUntil) {
      this.touch(key, entry);
      if ("error" in entry) throw entry.error;
      return { value: entry.value as T, state: "hit", fetchedAt: entry.storedAt, ttlSeconds: Math.max(1, Math.ceil((entry.freshUntil - now) / 1000)) };
    }

    let flight = this.inflight.get(key);
    if (!flight) {
      flight = this.load(key, fetcher, entry, opts).finally(() => this.inflight.delete(key));
      this.inflight.set(key, flight);
    }
    return flight as Promise<Resolved<T>>;
  }

  private async load<T>(key: string, fetcher: () => Promise<Fetched<T>>, previous: Entry | undefined, opts: ResolveOptions): Promise<Resolved<T>> {
    try {
      const f = await fetcher();
      const now = this.now();
      this.put(key, { value: f.value, storedAt: now, freshUntil: now + f.ttlSeconds * 1000, staleUntil: now + (f.ttlSeconds + f.staleSeconds) * 1000 });
      return { value: f.value, state: "miss", fetchedAt: now, ttlSeconds: f.ttlSeconds };
    } catch (error) {
      const now = this.now();
      const negative = opts.negativeTtlSeconds?.(error);
      if (negative && negative > 0) {
        this.put(key, { error, storedAt: now, freshUntil: now + negative * 1000, staleUntil: now + negative * 1000 });
        throw error;
      }
      if (previous && "value" in previous && now < previous.staleUntil) {
        return { value: previous.value as T, state: "stale", fetchedAt: previous.storedAt, ttlSeconds: STALE_RETRY_SECONDS, staleCause: error };
      }
      throw error;
    }
  }

  /** Reinsere no fim do Map (mais recente) e descarta o mais antigo se passou do teto. */
  private put(key: string, entry: Entry): void {
    this.store.delete(key);
    this.store.set(key, entry);
    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  private touch(key: string, entry: Entry): void {
    this.store.delete(key);
    this.store.set(key, entry);
  }
}
