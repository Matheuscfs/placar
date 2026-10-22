"use client";

import { useEffect } from "react";
import { favoritesCookieString } from "@/lib/ui/favorites-cookie";
import { useFavorites } from "@/lib/ui/use-favorites";

/** Mantém o cookie-espelho igual ao localStorage (inclusive para quem já tinha favoritos antes do cookie existir). */
export function FavoritesCookieSync() {
  const { favorites } = useFavorites();
  useEffect(() => {
    document.cookie = favoritesCookieString(favorites, window.location.protocol === "https:");
  }, [favorites]);
  return null;
}
