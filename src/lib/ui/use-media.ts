"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Acompanha uma media query (ex.: `(min-width: 768px)`). No servidor e em ambientes sem `matchMedia`
 * (testes) responde `false`; no cliente passa ao valor real logo após a hidratação, sem erro.
 * Serve para NÃO montar o que o CSS só esconderia (o detalhe lado a lado não deve existir no celular).
 */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia?.(query);
      mql?.addEventListener?.("change", onChange);
      return () => mql?.removeEventListener?.("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia?.(query).matches === true, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
