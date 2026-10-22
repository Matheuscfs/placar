"use client";

import type { LeagueId, ResponseMeta } from "@/lib/domain/types";
import { formatAge, SOURCE_NAMES } from "@/lib/ui/format";
import { leagueById } from "@/lib/ui/leagues";
import { useNow } from "@/lib/ui/use-now";
import { RefreshIcon } from "./icons";

/**
 * Avisos de qualidade do dado, só quando há algo a dizer: fonte reserva, dado velho, ligas sem dados.
 * Cada texto diz o que aconteceu e o que isso significa para quem lê o placar.
 */
export function DataNotices({ meta, extra }: { meta: ResponseMeta | null; extra?: string }) {
  const now = useNow(15_000);
  if (!meta) return null;

  const notes: string[] = [];
  if (meta.cache === "stale" && now !== null) {
    notes.push(`As fontes não responderam agora. Mostrando os dados de ${formatAge(now - Date.parse(meta.fetchedAt))}.`);
  } else if (meta.cache === "stale") {
    notes.push("As fontes não responderam agora. Mostrando os últimos dados salvos.");
  }
  if (meta.fallback) {
    const only = meta.sources.map((s) => SOURCE_NAMES[s]).join(" e ");
    notes.push(`Dados da fonte reserva (${only}): podem demorar a atualizar.`);
  }
  if (meta.missing.length > 0) {
    const names = meta.missing.map((id: LeagueId) => leagueById(id)?.shortName ?? id).join(", ");
    notes.push(`Sem dados agora para ${names}.`);
  }
  if (extra) notes.push(extra);
  if (notes.length === 0) return null;

  return (
    <div role="status" className="mt-5 space-y-1 border-l-2 border-line pl-3 text-sm text-muted">
      {notes.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </div>
  );
}

/** "Atualizado há 12 s" + botão de atualizar. O texto só aparece depois de carregar no navegador. */
export function UpdatedAt({ fetchedAt, refreshing, onRefresh }: { fetchedAt: number | null; refreshing: boolean; onRefresh: () => void }) {
  const now = useNow(5_000);
  return (
    <div className="flex items-center gap-1 text-sm text-muted">
      <span className="num" aria-live="off">
        {refreshing ? "Atualizando…" : fetchedAt !== null && now !== null ? `Atualizado ${formatAge(now - fetchedAt)}` : " "}
      </span>
      <button type="button" onClick={onRefresh} aria-label="Atualizar agora" className="-mr-3 grid h-11 w-11 place-items-center rounded-full hover:bg-surface hover:text-ink">
        <RefreshIcon width={18} height={18} className={refreshing ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
