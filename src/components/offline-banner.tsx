"use client";

import { useSyncExternalStore } from "react";
import { WifiOffIcon } from "./icons";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Aviso fixo de "sem conexão". No servidor assume que há conexão, então o HTML inicial nunca o inclui. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="mx-auto mb-2 flex w-full max-w-[40rem] items-center gap-2 px-5 text-sm text-muted">
      <WifiOffIcon width={16} height={16} />
      <span>Sem conexão. Mostrando os últimos dados salvos.</span>
    </div>
  );
}
