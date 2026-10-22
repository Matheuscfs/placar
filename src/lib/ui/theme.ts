/**
 * Tema da interface: "system" segue o aparelho; "light" e "dark" são escolha da pessoa e ficam
 * guardados no navegador. A escolha vira o atributo `data-theme` do <html> (o CSS lê dele); em
 * "system" o atributo não existe e vale `prefers-color-scheme`.
 */
export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "placar-theme";
export const THEMES: readonly Theme[] = ["system", "light", "dark"];

/** Cor da barra do navegador em cada tema (a mesma do `--bg`). */
export const THEME_COLORS = { light: "#ffffff", dark: "#12151c" } as const;

const META_ID = "placar-theme-color";

export function parseTheme(raw: unknown): Theme {
  return raw === "light" || raw === "dark" ? raw : "system";
}

/**
 * Roda no <head>, antes da primeira pintura, para a página já nascer no tema escolhido (sem piscar
 * o claro antes do escuro). Escrito à mão e em ES5 de propósito: é texto, não passa pelo compilador.
 * Mantenha em sincronia com `applyTheme`.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark"){var d=document.documentElement;d.setAttribute("data-theme",t);var m=document.createElement("meta");m.name="theme-color";m.id="${META_ID}";m.content=t==="dark"?"${THEME_COLORS.dark}":"${THEME_COLORS.light}";document.head.insertBefore(m,document.head.firstChild)}}catch(e){}})();`;

/** Aplica o tema na página: atributo no <html> e cor da barra do navegador. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const existing = document.getElementById(META_ID);
  if (theme === "system") {
    root.removeAttribute("data-theme");
    existing?.remove(); // volta às duas metas com `media` do layout
    return;
  }
  root.setAttribute("data-theme", theme);
  // A primeira meta `theme-color` cuja mídia combina vence; por isso a nossa (sem mídia) vai na frente.
  const meta = existing ?? Object.assign(document.createElement("meta"), { id: META_ID, name: "theme-color" });
  meta.setAttribute("content", THEME_COLORS[theme]);
  if (!existing) document.head.insertBefore(meta, document.head.firstChild);
}

/** O tema que a pessoa está de fato vendo agora (resolve "system" pelo aparelho). */
export function effectiveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

let current: Theme | null = null;
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    return parseTheme(window.localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

export function getThemeSnapshot(): Theme {
  if (typeof window === "undefined") return "system";
  if (current === null) current = read();
  return current;
}

/** No servidor não se sabe a escolha: o HTML sai em "system" e o script do <head> já acertou o visual. */
export const getServerThemeSnapshot = (): Theme => "system";

export function setTheme(next: Theme): void {
  current = next;
  try {
    if (next === "system") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, next);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
  applyTheme(next);
  for (const l of listeners) l();
}

export function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === null) {
      current = read(); // outra aba mudou
      applyTheme(current);
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Só para testes. */
export function resetThemeStore(): void {
  current = null;
  listeners.clear();
}
