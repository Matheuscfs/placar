"use client";

import { useEffect } from "react";

/** Registra o service worker. Só em produção: em desenvolvimento ele atrapalharia o recarregamento. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    // Depois do carregamento: o registro não deve competir com a primeira pintura.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
