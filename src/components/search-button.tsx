"use client";

import { openSearch } from "@/lib/ui/search-store";
import { SearchIcon } from "./icons";

/** Só o ícone: cabeçalho do celular. */
export function SearchIconButton() {
  return (
    <button type="button" onClick={openSearch} aria-label="Buscar time ou campeonato" className="-m-2 p-2 text-muted hover:text-ink">
      <SearchIcon />
    </button>
  );
}

/** Linha do trilho lateral: ícone sozinho no trilho estreito; com nome e atalho no largo. */
export function SearchRailButton() {
  return (
    <button
      type="button"
      onClick={openSearch}
      aria-label="Buscar time ou campeonato"
      aria-keyshortcuts="Control+K /"
      title="Buscar (Ctrl K)"
      className="flex h-11 w-full items-center justify-center gap-3 rounded-xl bg-surface text-[0.95rem] font-semibold text-muted transition-colors hover:text-ink min-[1200px]:justify-start min-[1200px]:px-3"
    >
      <SearchIcon className="shrink-0" />
      <span className="hidden min-[1200px]:inline">Buscar</span>
      <kbd aria-hidden className="ml-auto hidden rounded-md border border-line px-1.5 py-0.5 font-sans text-xs font-semibold min-[1200px]:inline">
        Ctrl K
      </kbd>
    </button>
  );
}
