"use client";

import { useEffect, useState } from "react";
import { MIN_SEARCH_LENGTH } from "@/lib/api/search";
import type { ResponseMeta, Sourced, TeamSearchHit } from "@/lib/domain/types";

export type TeamSearchState = { status: "idle" } | { status: "loading" } | { status: "ok"; hits: TeamSearchHit[] } | { status: "error"; message: string };

/** Espera a pessoa parar de digitar antes de buscar: uma chamada por palavra, não uma por letra. */
const DEBOUNCE_MS = 250;

type Settled = { q: string; result: { hits: TeamSearchHit[] } | { message: string } };

/**
 * Busca times na NOSSA API conforme a pessoa digita. Com menos de 2 letras não busca. O resultado
 * só vale para a consulta que o gerou (digitou mais: volta a "buscando", nunca mostra a lista da consulta antiga).
 */
export function useTeamSearch(query: string): TeamSearchState {
  const q = query.trim().replace(/\s+/g, " ");
  const enabled = q.length >= MIN_SEARCH_LENGTH;
  const [debounced, setDebounced] = useState("");
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(enabled ? q : ""), enabled ? DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [q, enabled]);

  useEffect(() => {
    if (!debounced) return;
    const ctl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/teams/search?q=${encodeURIComponent(debounced)}`, { signal: ctl.signal, headers: { accept: "application/json" } });
        const body = (await res.json().catch(() => null)) as (Sourced<TeamSearchHit[]> & { meta: ResponseMeta; error?: { message?: string } }) | null;
        if (!res.ok || !body || body.error || !Array.isArray(body.data)) throw new Error(body?.error?.message ?? "Não foi possível buscar agora.");
        setSettled({ q: debounced, result: { hits: body.data } });
      } catch (e) {
        if (ctl.signal.aborted) return;
        setSettled({ q: debounced, result: { message: e instanceof Error ? e.message : "Não foi possível buscar agora." } });
      }
    })();
    return () => ctl.abort();
  }, [debounced]);

  if (!enabled) return { status: "idle" };
  if (!settled || settled.q !== q) return { status: "loading" };
  return "hits" in settled.result ? { status: "ok", hits: settled.result.hits } : { status: "error", message: settled.result.message };
}
