"use client";

import { createContext, useContext, type ReactNode } from "react";
import { EMPTY_FAVORITES, type Favorites } from "@/lib/ui/favorites";

const SeedContext = createContext<Favorites>(EMPTY_FAVORITES);

/** Favoritos que o servidor leu do cookie. Servem de valor inicial na hidratação; o localStorage assume depois. */
export function useFavoritesSeed(): Favorites {
  return useContext(SeedContext);
}

/** Envolve uma página renderizada no servidor com os favoritos do cookie, para a 1ª pintura já sair na ordem certa. */
export function FavoritesSeed({ value, children }: { value: Favorites; children: ReactNode }) {
  return <SeedContext.Provider value={value}>{children}</SeedContext.Provider>;
}
