"use client";

import { useId, useRef } from "react";
import type { StatusFilter } from "@/lib/ui/filters";
import { CloseIcon, SearchIcon } from "./icons";

interface Props {
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  liveCount: number;
  favoriteCount: number;
  query: string;
  onQuery: (q: string) => void;
  searchOpen: boolean;
  onSearchOpen: (open: boolean) => void;
}

const chip = (selected: boolean) =>
  `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[0.92rem] font-semibold transition-colors ${selected ? "bg-ink text-bg" : "bg-surface text-ink hover:bg-line"}`;

/**
 * Filtros da tela inicial: "Todos", "Ao vivo" e "Favoritos" (só aparecem quando há o que filtrar) e a busca
 * por time ou campeonato. A busca fica escondida atrás de uma lupa para a tela continuar limpa; aberta, ela
 * ganha o foco, e Esc fecha e limpa.
 */
export function MatchFilters({ status, onStatus, liveCount, favoriteCount, query, onQuery, searchOpen, onSearchOpen }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  // Mostra o filtro quando há o que filtrar, ou quando ele já está escolhido (senão a pessoa não conseguiria desligá-lo).
  const showLive = liveCount > 0 || status === "ao-vivo";
  const showFavorites = favoriteCount > 0 || status === "favoritos";
  const showChips = showLive || showFavorites;

  const openSearch = () => {
    onSearchOpen(true);
    // O campo só existe depois do próximo desenho: foca quando ele já estiver na tela.
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const closeSearch = () => {
    onQuery("");
    onSearchOpen(false);
  };

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between gap-2">
        {showChips ? (
          <div role="group" aria-label="Filtrar jogos" className="no-scrollbar -mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1" data-no-swipe>
            <button type="button" aria-pressed={status === "todos"} onClick={() => onStatus("todos")} className={chip(status === "todos")}>
              Todos
            </button>
            {showLive ? (
              <button type="button" aria-pressed={status === "ao-vivo"} onClick={() => onStatus("ao-vivo")} className={chip(status === "ao-vivo")}>
                {status !== "ao-vivo" ? <span aria-hidden className="live-dot" /> : null}
                Ao vivo
                <span className="num font-normal opacity-80">{liveCount}</span>
              </button>
            ) : null}
            {showFavorites ? (
              <button type="button" aria-pressed={status === "favoritos"} onClick={() => onStatus("favoritos")} className={chip(status === "favoritos")}>
                Favoritos
                <span className="num font-normal opacity-80">{favoriteCount}</span>
              </button>
            ) : null}
          </div>
        ) : (
          <span />
        )}
        {!searchOpen ? (
          <button type="button" onClick={openSearch} aria-label="Buscar time ou campeonato" className="-mr-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink">
            <SearchIcon />
          </button>
        ) : null}
      </div>

      {searchOpen ? (
        <div className="relative mt-2" data-no-swipe>
          <label htmlFor={id} className="sr-only">
            Buscar time ou campeonato
          </label>
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" width={18} height={18} />
          <input
            ref={inputRef}
            id={id}
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSearch();
            }}
            placeholder="Buscar time ou campeonato"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-11 w-full rounded-full bg-surface pl-11 pr-12 text-[1rem] text-ink placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          <button type="button" onClick={closeSearch} aria-label="Fechar a busca" className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-ink">
            <CloseIcon width={18} height={18} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
