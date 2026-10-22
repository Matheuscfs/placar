"use client";

import { StarIcon } from "./icons";

/**
 * Estrela de favorito. O nome acessível diz o que o clique faz ("Favoritar Flamengo" / "Remover
 * Flamengo dos favoritos") e `aria-pressed` diz o estado atual. A área de toque tem 44 px.
 */
export function FavoriteButton({ pressed, onToggle, name, className = "" }: { pressed: boolean; onToggle: () => void; name: string; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={pressed ? `Remover ${name} dos favoritos` : `Favoritar ${name}`}
      onClick={onToggle}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface ${pressed ? "text-ink" : "text-faint hover:text-ink"} ${className}`}
    >
      <StarIcon filled={pressed} width={21} height={21} />
    </button>
  );
}
