"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { normalizeText } from "@/lib/ui/filters";
import { PUBLIC_LEAGUES } from "@/lib/ui/leagues";
import { closeSearch, openSearch, useSearchOpen } from "@/lib/ui/search-store";
import { useTeamSearch } from "@/lib/ui/use-team-search";
import { Crest } from "./crest";
import { CloseIcon, SearchIcon } from "./icons";

const MAX_LEAGUES = 4;

/** Atalhos: Ctrl/Cmd+K em qualquer lugar; "/" quando a pessoa não está digitando num campo. */
function useSearchShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        openSearch();
      } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const rowClass = "flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-surface focus-visible:bg-surface";

/**
 * Busca geral: times (pela API, ESPN) e campeonatos (do catálogo, na hora). É um `<dialog>` modal, então o
 * foco fica preso nele, Esc fecha e o resto da página fica inerte, sem código extra. Enter abre o 1º resultado.
 */
export function SearchDialog() {
  const open = useSearchOpen();
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const teams = useTeamSearch(query);
  useSearchShortcuts();

  const q = query.trim();
  const leagues = useMemo(() => {
    const n = normalizeText(q);
    if (n.length < 2) return [];
    return PUBLIC_LEAGUES.filter((l) => normalizeText(`${l.name} ${l.shortName}`).includes(n)).slice(0, MAX_LEAGUES);
  }, [q]);

  // Estado do store → estado do <dialog> (e foco no campo ao abrir).
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      inputRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  const close = () => {
    setQuery("");
    closeSearch();
  };

  // Enter abre o melhor resultado: o primeiro time; sem times (ainda), o primeiro campeonato.
  const topHref = teams.status === "ok" && teams.hits[0] ? `/time/${teams.hits[0].team.id}` : leagues[0] ? `/liga/${leagues[0].id}` : null;

  return (
    <dialog
      ref={ref}
      aria-label="Buscar time ou campeonato"
      onClose={close}
      // Clique no fundo escurecido (o próprio <dialog>, fora do conteúdo) fecha.
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className="fixed inset-x-0 top-[8vh] m-auto max-h-[80dvh] w-[min(34rem,calc(100vw-1.5rem))] overflow-hidden rounded-3xl bg-bg p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex max-h-[80dvh] flex-col">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (topHref) {
              router.push(topHref);
              close();
            }
          }}
          className="relative border-b border-line p-3"
        >
          <label htmlFor={inputId} className="sr-only">
            Buscar time ou campeonato
          </label>
          <SearchIcon className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-muted" width={18} height={18} />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar time ou campeonato"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-12 w-full rounded-full bg-surface pl-11 pr-12 text-[1rem] text-ink placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          <button type="button" onClick={close} aria-label="Fechar a busca" className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-ink">
            <CloseIcon width={18} height={18} />
          </button>
        </form>

        <div className="overflow-y-auto p-2" aria-live="polite">
          {teams.status === "idle" && leagues.length === 0 ? <p className="px-3 py-6 text-center text-muted">Digite o nome de um time ou de um campeonato.</p> : null}

          {leagues.length > 0 ? (
            <section aria-labelledby={`${inputId}-ligas`}>
              <h2 id={`${inputId}-ligas`} className="px-3 pb-1 pt-2 text-[0.8rem] font-bold text-muted">
                Campeonatos
              </h2>
              <ul>
                {leagues.map((l) => (
                  <li key={l.id}>
                    <Link href={`/liga/${l.id}`} onClick={close} className={rowClass}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{l.name}</span>
                        <span className="block text-sm text-muted">{l.country}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {teams.status !== "idle" ? (
            <section aria-labelledby={`${inputId}-times`}>
              <h2 id={`${inputId}-times`} className="px-3 pb-1 pt-2 text-[0.8rem] font-bold text-muted">
                Times
              </h2>
              {teams.status === "loading" ? <p className="px-3 py-4 text-muted">Buscando…</p> : null}
              {teams.status === "error" ? (
                <p role="alert" className="px-3 py-4 text-zone-down">
                  {teams.message}
                </p>
              ) : null}
              {teams.status === "ok" && teams.hits.length === 0 ? (
                <p className="px-3 py-4 text-muted">
                  Nenhum time encontrado para “{q}”. Confira a grafia ou busque só parte do nome.
                </p>
              ) : null}
              {teams.status === "ok" && teams.hits.length > 0 ? (
                <ul>
                  {teams.hits.map(({ team, leagueName }) => (
                    <li key={team.id}>
                      <Link href={`/time/${team.id}`} onClick={close} className={rowClass}>
                        <Crest team={team} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{team.name}</span>
                          {leagueName ? <span className="block truncate text-sm text-muted">{leagueName}</span> : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
