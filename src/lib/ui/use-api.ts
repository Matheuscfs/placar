"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Sourced } from "@/lib/domain/types";

export interface ApiOptions<T> {
  /** Dados já buscados no servidor para `initialUrl`: a tela nasce pronta, sem esperar a rede. */
  initial?: Sourced<T> | null;
  initialUrl?: string;
  /** Em quantos ms buscar de novo (`null` = não buscar). Recebe os dados atuais e o nº de falhas seguidas. */
  nextRefreshMs: (data: Sourced<T> | null, failures: number) => number | null;
}

export interface ApiResult<T> {
  data: Sourced<T> | null;
  error: string | null;
  /** Primeira carga desta URL, ainda sem nada para mostrar. */
  loading: boolean;
  /** Atualizando em segundo plano (já há dados na tela). */
  refreshing: boolean;
  /** Quando os dados foram buscados na fonte (ms), para "atualizado há…". */
  fetchedAt: number | null;
  refresh: () => void;
}

interface Slot<T> {
  url: string | null;
  data: Sourced<T> | null;
  error: string | null;
  failures: number;
  refreshing: boolean;
}

const emptySlot = <T,>(url: string | null): Slot<T> => ({ url, data: null, error: null, failures: 0, refreshing: false });

async function fetchSourced<T>(url: string, signal: AbortSignal): Promise<Sourced<T>> {
  const res = await fetch(url, { signal, headers: { accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as (Sourced<T> & { error?: { message?: string } }) | null;
  if (!res.ok || !body || body.error || !body.meta) throw new Error(body?.error?.message ?? "Não foi possível carregar os dados.");
  return body;
}

/**
 * Busca `url` na NOSSA API e mantém os dados atualizados. Regras:
 * - a URL mudou → mostra "carregando" até chegar (nunca dados de outra URL);
 * - erro numa atualização → mantém o que já estava na tela e tenta de novo com recuo;
 * - aba escondida ou sem internet → não busca; ao voltar, busca na hora se estiver atrasado.
 */
export function useApi<T>(url: string | null, opts: ApiOptions<T>): ApiResult<T> {
  const [slot, setSlot] = useState<Slot<T>>(() =>
    opts.initial && url !== null && (opts.initialUrl ?? url) === url ? { ...emptySlot<T>(url), data: opts.initial } : emptySlot<T>(url),
  );
  const current = slot.url === url ? slot : emptySlot<T>(url);

  const nextRefreshRef = useRef(opts.nextRefreshMs);
  useEffect(() => {
    nextRefreshRef.current = opts.nextRefreshMs;
  });
  const abortRef = useRef<AbortController | null>(null);
  const dueRef = useRef(false); // um refresh venceu enquanto a aba estava escondida

  // A busca em si. Não mexe em estado antes do primeiro `await` (pode ser chamada de dentro de um efeito).
  const run = useCallback(
    async (target: string) => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const data = await fetchSourced<T>(target, ctl.signal);
        setSlot({ url: target, data, error: null, failures: 0, refreshing: false });
      } catch (e) {
        if (ctl.signal.aborted) return;
        const message = e instanceof Error ? e.message : "Não foi possível carregar os dados.";
        setSlot((s) => (s.url === target ? { ...s, error: message, failures: s.failures + 1, refreshing: false } : { ...emptySlot<T>(target), error: message, failures: 1 }));
      }
    },
    [],
  );

  // Atualização com dados já na tela: acende "atualizando" e busca. Só chamada por timers e cliques.
  const refreshInBackground = useCallback(
    (target: string) => {
      setSlot((s) => (s.url === target ? { ...s, refreshing: true } : s));
      void run(target);
    },
    [run],
  );

  // Primeira carga da URL, a menos que já haja algo resolvido para ela (dados que o servidor mandou, ou um erro).
  // ATENÇÃO: "tem espaço reservado para esta URL" NÃO basta — sem dados do servidor o espaço nasce vazio e
  // ainda precisa da primeira busca (antes, uma página aberta sem dados iniciais ficava presa em "carregando").
  const hasSlotForUrl = slot.url === url && (slot.data !== null || slot.error !== null);
  useEffect(() => {
    if (url === null || hasSlotForUrl) return;
    // Buscar dados ao montar é sincronizar com um sistema externo (a rede): o estado só muda
    // quando a resposta chega (depois de um `await`), nunca de forma síncrona neste efeito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run(url);
    return () => abortRef.current?.abort();
  }, [url, hasSlotForUrl, run]);

  // Atualização periódica.
  const { data, failures } = current;
  useEffect(() => {
    if (url === null || (!data && failures === 0)) return;
    const delay = nextRefreshRef.current(data, failures);
    if (delay === null) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "hidden" || navigator.onLine === false) {
        dueRef.current = true; // espera a aba/internet voltar
        return;
      }
      if (data !== null) refreshInBackground(url);
      else void run(url);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [url, data, failures, run, refreshInBackground]);

  // Ao voltar para a aba ou à internet, busca na hora o que venceu.
  useEffect(() => {
    if (url === null) return;
    const resume = () => {
      if (!dueRef.current || document.visibilityState === "hidden" || navigator.onLine === false) return;
      dueRef.current = false;
      refreshInBackground(url);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [url, refreshInBackground]);

  const hasData = current.data !== null;
  const refresh = useCallback(() => {
    if (url === null) return;
    if (hasData) refreshInBackground(url);
    else void run(url);
  }, [url, hasData, run, refreshInBackground]);

  return {
    data: current.data,
    error: current.error,
    loading: current.data === null && current.error === null,
    refreshing: current.refreshing,
    fetchedAt: current.data ? Date.parse(current.data.meta.fetchedAt) : null,
    refresh,
  };
}
