"use client";

import { useSyncExternalStore } from "react";

/**
 * A busca geral (times e campeonatos) abre num diálogo montado uma vez no layout. Os botões do trilho e do
 * cabeçalho, e os atalhos de teclado, só mudam este estado. Armazenamento externo para `useSyncExternalStore`.
 */
let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (open === next) return;
  open = next;
  for (const l of listeners) l();
}

export const openSearch = () => set(true);
export const closeSearch = () => set(false);

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
};

export function useSearchOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}

/** Só para testes. */
export function resetSearchStore(): void {
  open = false;
  listeners.clear();
}
