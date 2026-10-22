"use client";

import { useSyncExternalStore } from "react";

/**
 * Relógio para textos como "atualizado há 12 s". No servidor devolve `null` e no cliente o
 * instante atual, então o HTML do servidor nunca contém um horário que o navegador contradiga
 * (o que causaria erro de hidratação). Atualiza a cada `intervalMs`.
 *
 * ATENÇÃO (já deu loop infinito uma vez): a função `subscribe` entregue ao `useSyncExternalStore`
 * precisa ter identidade ESTÁVEL entre renders, senão o React reassina a cada render. Por isso
 * ela vive dentro do store de cada intervalo, criado uma vez. E assinar nunca altera o valor
 * lido; só o timer altera.
 */
interface ClockStore {
  tick: number;
  timer: number | null;
  listeners: Set<() => void>;
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => number;
}

const stores = new Map<number, ClockStore>();

function storeFor(intervalMs: number): ClockStore {
  const existing = stores.get(intervalMs);
  if (existing) return existing;
  const created: ClockStore = {
    tick: Date.now(),
    timer: null,
    listeners: new Set(),
    subscribe(onChange) {
      created.listeners.add(onChange);
      if (created.timer === null) {
        created.timer = window.setInterval(() => {
          created.tick = Date.now();
          for (const l of created.listeners) l();
        }, intervalMs);
      }
      return () => {
        created.listeners.delete(onChange);
        if (created.listeners.size === 0 && created.timer !== null) {
          window.clearInterval(created.timer);
          created.timer = null;
        }
      };
    },
    getSnapshot: () => created.tick,
  };
  stores.set(intervalMs, created);
  return created;
}

const serverSnapshot = () => null;

export function useNow(intervalMs = 5_000): number | null {
  const store = storeFor(intervalMs);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
}

/** Só para testes. */
export function resetNowStores(): void {
  for (const s of stores.values()) if (s.timer !== null) window.clearInterval(s.timer);
  stores.clear();
}
