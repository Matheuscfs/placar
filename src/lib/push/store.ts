import type { MatchSnapshot, PushSubscriber } from "./types";

/**
 * Onde ficam inscritos e "o que sabíamos de cada jogo". Duas coisas em um repositório só porque
 * as duas precisam sobreviver entre uma execução do job e a seguinte.
 *
 * ATENÇÃO: a implementação deste arquivo é EM MEMÓRIA. Serve para desenvolvimento e testes. Em
 * produção na Vercel (funções que sobem e descem, várias instâncias) ela perde tudo. Para valer de
 * verdade, implemente esta interface em cima do Supabase: veja `docs/NOTIFICACOES.md` (tabelas e SQL).
 */
export interface PushStore {
  upsertSubscriber(subscriber: PushSubscriber): Promise<void>;
  removeSubscriber(id: string): Promise<void>;
  listSubscribers(): Promise<PushSubscriber[]>;
  getSnapshots(matchIds: string[]): Promise<Map<string, MatchSnapshot>>;
  saveSnapshots(entries: Map<string, MatchSnapshot>): Promise<void>;
  /** Esquece jogos vistos pela última vez antes de `olderThan` (ISO). */
  pruneSnapshots(olderThan: string): Promise<void>;
}

/** Teto de inscritos em memória: protege o servidor se alguém tentar encher a rota de inscrição. */
export const MAX_MEMORY_SUBSCRIBERS = 5000;

/** O repositório não aceita mais inscritos novos (a rota responde 503, sem derrubar nada). */
export class PushStoreFullError extends Error {
  constructor() {
    super("Limite de inscritos atingido.");
    this.name = "PushStoreFullError";
  }
}

export class MemoryPushStore implements PushStore {
  private readonly subscribers = new Map<string, PushSubscriber>();
  private readonly snapshots = new Map<string, MatchSnapshot>();

  async upsertSubscriber(subscriber: PushSubscriber): Promise<void> {
    const existing = this.subscribers.get(subscriber.id);
    if (!existing && this.subscribers.size >= MAX_MEMORY_SUBSCRIBERS) throw new PushStoreFullError();
    this.subscribers.set(subscriber.id, existing ? { ...subscriber, createdAt: existing.createdAt } : subscriber);
  }

  async removeSubscriber(id: string): Promise<void> {
    this.subscribers.delete(id);
  }

  async listSubscribers(): Promise<PushSubscriber[]> {
    return [...this.subscribers.values()];
  }

  async getSnapshots(matchIds: string[]): Promise<Map<string, MatchSnapshot>> {
    const out = new Map<string, MatchSnapshot>();
    for (const id of matchIds) {
      const s = this.snapshots.get(id);
      if (s) out.set(id, s);
    }
    return out;
  }

  async saveSnapshots(entries: Map<string, MatchSnapshot>): Promise<void> {
    for (const [id, s] of entries) this.snapshots.set(id, s);
  }

  async pruneSnapshots(olderThan: string): Promise<void> {
    for (const [id, s] of this.snapshots) if (s.seenAt < olderThan) this.snapshots.delete(id);
  }
}

// Mesmo motivo do orquestrador: em `next dev` os módulos recarregam, e sem isto os inscritos sumiriam a cada edição.
const KEY = Symbol.for("placar.pushStore");
type Holder = { [KEY]?: PushStore };

export function getPushStore(): PushStore {
  const g = globalThis as Holder;
  return (g[KEY] ??= new MemoryPushStore());
}

/** Só para testes: troca (ou limpa, com `null`) o repositório global. */
export function setPushStoreForTests(store: PushStore | null): void {
  const g = globalThis as Holder;
  if (store) g[KEY] = store;
  else delete g[KEY];
}
