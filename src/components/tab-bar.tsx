"use client";

import Link from "next/link";
import { navItems, useActiveHref } from "./nav-items";

/** Barra inferior do celular (abaixo de 768 px): as seções ao alcance do polegar. */
export function TabBar({ esports }: { esports: boolean }) {
  const items = navItems(esports);
  const active = useActiveHref(items);
  return (
    <nav
      aria-label="Seções"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-bg px-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 min-[768px]:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(({ href, short, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-label={label}
          aria-current={active === href ? "page" : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.7rem] font-semibold ${active === href ? "text-ink" : "text-muted"}`}
        >
          <Icon width={22} height={22} />
          {short}
        </Link>
      ))}
    </nav>
  );
}
