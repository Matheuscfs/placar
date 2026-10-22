"use client";

import { useSyncExternalStore } from "react";
import { getServerThemeSnapshot, getThemeSnapshot, setTheme, subscribeTheme, type Theme } from "./theme";

/** A escolha de tema da pessoa e como trocá-la. */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot);
  return { theme, setTheme };
}
