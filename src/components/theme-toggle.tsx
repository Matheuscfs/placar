"use client";

import { effectiveTheme, THEMES, type Theme } from "@/lib/ui/theme";
import { useTheme } from "@/lib/ui/use-theme";
import { MoonIcon, SunIcon } from "./icons";

/**
 * Botão do cabeçalho: vira para o outro tema. Mostra a lua quando está claro e o sol quando está
 * escuro. Qual ícone aparece é decidido só pelo CSS (`.theme-sun` / `.theme-moon`, que olham o mesmo
 * `data-theme` e `prefers-color-scheme` do resto), então não há diferença entre servidor e cliente.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      type="button"
      aria-label="Trocar entre tema claro e escuro"
      onClick={() => setTheme(effectiveTheme(theme) === "dark" ? "light" : "dark")}
      className="-m-2 p-2 text-muted hover:text-ink"
    >
      <SunIcon className="theme-sun" />
      <MoonIcon className="theme-moon" />
    </button>
  );
}

const LABELS: Record<Theme, string> = { system: "Automático", light: "Claro", dark: "Escuro" };

/** Rodapé: as três opções, incluindo "Automático" (segue o aparelho). */
export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Aparência" className="mt-6 inline-flex rounded-full bg-surface p-1">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => setTheme(t)}
          className={`h-9 rounded-full px-4 text-sm font-semibold ${theme === t ? "bg-bg text-ink shadow-sm" : "text-muted hover:text-ink"}`}
        >
          {LABELS[t]}
        </button>
      ))}
    </div>
  );
}
