"use client";

import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { BallIcon, GamepadIcon, StarIcon, TableIcon, TvIcon } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  /** Nome curto para a barra inferior, onde falta espaço. */
  short: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Prefixos de rota que também contam como "estou aqui" (ex.: um jogo pertence a "Jogos"). */
  also?: string[];
}

/** As seções do app, na ordem do desenho V2. E-sports só entra se este servidor tem a fonte configurada. */
export function navItems(esports: boolean): NavItem[] {
  return [
    { href: "/", label: "Jogos", short: "Jogos", Icon: BallIcon, also: ["/jogo", "/time"] },
    { href: "/onde-assistir", label: "Onde assistir", short: "Assistir", Icon: TvIcon },
    { href: "/liga", label: "Tabelas", short: "Tabelas", Icon: TableIcon },
    ...(esports ? [{ href: "/esports", label: "E-sports", short: "E-sports", Icon: GamepadIcon }] : []),
    { href: "/favoritos", label: "Favoritos", short: "Favoritos", Icon: StarIcon },
  ];
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/" || (item.also ?? []).some((p) => pathname === p || pathname.startsWith(`${p}/`));
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function useActiveHref(items: NavItem[]): string | null {
  const pathname = usePathname() ?? "/";
  return items.find((i) => isActive(pathname, i))?.href ?? null;
}
