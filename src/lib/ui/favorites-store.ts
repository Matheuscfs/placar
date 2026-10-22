import { EMPTY_FAVORITES, FAVORITES_KEY, parseFavorites, serializeFavorites, type Favorites } from "./favorites";

/**
 * Armazenamento externo (para `useSyncExternalStore`): guarda UM objeto de favoritos e só o
 * troca quando algo muda, então os componentes não renderizam à toa. Acompanha outras abas pelo
 * evento `storage`.
 *
 * `localStorage` pode não existir ou lançar (aba privada, bloqueio de cookies): nesse caso os
 * favoritos funcionam só enquanto a página está aberta.
 */
let current: Favorites | null = null;
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return window.localStorage.getItem(FAVORITES_KEY);
  } catch {
    return null;
  }
}

export function getFavoritesSnapshot(): Favorites {
  if (typeof window === "undefined") return EMPTY_FAVORITES;
  if (current === null) current = parseFavorites(read());
  return current;
}

/** No servidor não há favoritos: o HTML inicial sai sem eles e o cliente reordena ao hidratar. */
export const getServerFavoritesSnapshot = () => EMPTY_FAVORITES;

export function setFavorites(next: Favorites): void {
  current = next;
  try {
    if (next.teams.length || next.leagues.length) window.localStorage.setItem(FAVORITES_KEY, serializeFavorites(next));
    else window.localStorage.removeItem(FAVORITES_KEY);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  for (const l of listeners) l();
}

export function subscribeFavorites(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAVORITES_KEY || e.key === null) {
      current = null; // outra aba mudou: relê na próxima leitura
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Só para testes. */
export function resetFavoritesStore(): void {
  current = null;
  listeners.clear();
}
