"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { detectPushSupport, disablePush, enablePush, fetchPushConfig, getExistingSubscription, PushClientError, syncPush } from "./push-client";

export type PushStatus =
  | "checking" // ainda descobrindo
  | "unsupported" // navegador sem Web Push
  | "needs-install" // iPhone/iPad: instalar na tela de início primeiro
  | "unavailable" // o servidor não tem avisos ligados (sem chaves VAPID)
  | "denied" // permissão negada no navegador
  | "off"
  | "on";

export interface UsePush {
  status: PushStatus;
  /** Ligando/desligando agora. */
  busy: boolean;
  error: string | null;
  toggle: () => void;
}

const subscribeNothing = () => () => undefined;
const SYNC_DELAY_MS = 800;

type Remote = { phase: "loading" } | { phase: "ready"; publicKey: string | null; denied: boolean; subscribed: boolean };

/**
 * Estado dos avisos deste aparelho. Mantém o servidor em dia sobre os times favoritos: reenvia a lista
 * quando ela muda e uma vez ao abrir (assim o aparelho se re-registra sozinho se o servidor perdeu o cadastro).
 */
export function usePush(teamKeys: string[]): UsePush {
  const support = useSyncExternalStore(subscribeNothing, detectPushSupport, () => null);
  const [remote, setRemote] = useState<Remote>({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref para o job de sincronização e o clique lerem a lista MAIS RECENTE sem refazer os efeitos a cada render.
  const teamsRef = useRef(teamKeys);
  useEffect(() => {
    teamsRef.current = teamKeys;
  });
  const teamsSignature = teamKeys.join("|");

  useEffect(() => {
    if (support !== "supported") return;
    let cancelled = false;
    (async () => {
      const config = await fetchPushConfig();
      const subscribed = !!(await getExistingSubscription());
      if (cancelled) return;
      setRemote({ phase: "ready", publicKey: config?.enabled ? (config.publicKey ?? null) : null, denied: Notification.permission === "denied", subscribed });
    })();
    return () => {
      cancelled = true;
    };
  }, [support]);

  const subscribed = remote.phase === "ready" && remote.subscribed;
  useEffect(() => {
    if (!subscribed) return;
    const timer = setTimeout(() => void syncPush(teamsRef.current).catch(() => undefined), SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [subscribed, teamsSignature]);

  let status: PushStatus;
  if (support === null) status = "checking";
  else if (support !== "supported") status = support;
  else if (remote.phase === "loading") status = "checking";
  else if (!remote.publicKey) status = "unavailable";
  else if (remote.subscribed) status = "on";
  else status = remote.denied ? "denied" : "off";

  const publicKey = remote.phase === "ready" ? remote.publicKey : null;
  const toggle = useCallback(() => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const run = async () => {
      if (subscribed) {
        await disablePush();
        setRemote((r) => (r.phase === "ready" ? { ...r, subscribed: false } : r));
      } else if (publicKey) {
        const result = await enablePush(publicKey, teamsRef.current);
        setRemote((r) => (r.phase === "ready" ? { ...r, subscribed: result === "on", denied: result === "denied" } : r));
      }
    };
    run()
      .catch((e: unknown) => setError(e instanceof PushClientError ? e.message : "Não foi possível alterar os avisos. Tente de novo."))
      .finally(() => setBusy(false));
  }, [busy, subscribed, publicKey]);

  return { status, busy, error, toggle };
}
