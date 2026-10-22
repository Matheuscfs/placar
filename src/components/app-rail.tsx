"use client";

import Link from "next/link";
import { useFavorites } from "@/lib/ui/use-favorites";
import { Crest } from "./crest";
import { navItems, useActiveHref } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";

/**
 * Trilho lateral (a partir de 900 px): marca, seções, os times favoritos e o tema. De 900 a 1199 px
 * mostra só os ícones; de 1200 px em diante, ícones e nomes. Fica parado enquanto o resto rola.
 */
export function AppRail({ esports }: { esports: boolean }) {
  const items = navItems(esports);
  const active = useActiveHref(items);
  const { favorites } = useFavorites();

  return (
    <aside className="sticky top-0 hidden h-dvh w-[4.75rem] shrink-0 flex-col gap-6 overflow-y-auto border-r border-line px-2.5 py-5 min-[900px]:flex min-[1200px]:w-[15.5rem] min-[1200px]:px-3.5">
      <Link href="/" aria-label="Placar, página inicial" className="flex h-11 items-center justify-center min-[1200px]:justify-start min-[1200px]:px-2.5">
        <Wordmark className="max-[1199px]:text-[0px] max-[1199px]:[&>span]:ml-0 max-[1199px]:[&>span]:h-3.5 max-[1199px]:[&>span]:w-3.5" />
      </Link>

      <nav aria-label="Seções" className="flex flex-col gap-0.5">
        {items.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active === href ? "page" : undefined}
            title={label}
            className={`flex h-11 items-center justify-center gap-3 rounded-xl text-[0.95rem] font-semibold transition-colors min-[1200px]:justify-start min-[1200px]:px-2.5 ${active === href ? "bg-surface text-ink" : "text-muted hover:bg-surface hover:text-ink"}`}
          >
            <Icon className="shrink-0" />
            <span className="hidden min-[1200px]:inline">{label}</span>
          </Link>
        ))}
      </nav>

      {favorites.teams.length > 0 ? (
        <section aria-labelledby="rail-times" className="hidden min-[1200px]:block">
          <h2 id="rail-times" className="mb-1 px-2.5 text-[0.8rem] font-bold text-muted">
            Meus times
          </h2>
          <ul>
            {favorites.teams.slice(0, 6).map((t) => (
              <li key={t.key}>
                <Link href={`/time/${t.id}`} className="flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-[0.92rem] font-medium hover:bg-surface">
                  <Crest team={t} size={22} />
                  <span className="truncate">{t.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-auto flex flex-col items-center gap-3 min-[1200px]:items-start min-[1200px]:px-2.5">
        <ThemeToggle />
        <Link href="/sobre" className="hidden text-sm font-medium text-muted underline decoration-line underline-offset-4 hover:text-ink min-[1200px]:inline">
          Sobre o Placar
        </Link>
      </div>
    </aside>
  );
}
