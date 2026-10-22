// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemePicker, ThemeToggle } from "@/components/theme-toggle";
import { applyTheme, effectiveTheme, getServerThemeSnapshot, getThemeSnapshot, parseTheme, resetThemeStore, setTheme, subscribeTheme, THEME_COLORS, THEME_INIT_SCRIPT, THEME_KEY } from "./theme";

const root = document.documentElement;
const themeColors = () => [...document.head.querySelectorAll('meta[name="theme-color"]')] as HTMLMetaElement[];

function stubSystemDark(dark: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: dark && q.includes("dark"), media: q }));
}

beforeEach(() => {
  window.localStorage.clear();
  resetThemeStore();
  root.removeAttribute("data-theme");
  document.getElementById("placar-theme-color")?.remove();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("tema: leitura e aplicação", () => {
  it("só aceita claro/escuro; qualquer outra coisa vira automático", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("roxo")).toBe("system");
    expect(parseTheme(null)).toBe("system");
  });

  it("escolher claro/escuro marca o <html> e a cor da barra; automático desfaz tudo", () => {
    applyTheme("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(themeColors()[0].content).toBe(THEME_COLORS.dark);
    applyTheme("light");
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(themeColors()).toHaveLength(1); // reaproveita a meta, não empilha
    expect(themeColors()[0].content).toBe(THEME_COLORS.light);
    applyTheme("system");
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(themeColors()).toHaveLength(0);
  });

  it("resolve o automático pelo aparelho", () => {
    stubSystemDark(true);
    expect(effectiveTheme("system")).toBe("dark");
    expect(effectiveTheme("light")).toBe("light");
    stubSystemDark(false);
    expect(effectiveTheme("system")).toBe("light");
  });
});

describe("script do <head> (antes da primeira pintura)", () => {
  const run = () => new Function(THEME_INIT_SCRIPT)();

  it("sem escolha guardada não mexe em nada", () => {
    run();
    expect(root.hasAttribute("data-theme")).toBe(false);
    expect(themeColors()).toHaveLength(0);
  });

  it.each(["light", "dark"] as const)("com %s guardado, aplica o tema e a cor da barra", (t) => {
    window.localStorage.setItem(THEME_KEY, t);
    run();
    expect(root.getAttribute("data-theme")).toBe(t);
    expect(themeColors()[0].content).toBe(THEME_COLORS[t]);
  });

  it("valor estranho guardado é ignorado", () => {
    window.localStorage.setItem(THEME_KEY, "roxo");
    run();
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("se o armazenamento lançar erro, não quebra a página", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(run).not.toThrow();
  });
});

describe("armazenamento do tema", () => {
  it("começa automático e devolve sempre o mesmo valor", () => {
    expect(getThemeSnapshot()).toBe("system");
    expect(getServerThemeSnapshot()).toBe("system");
  });

  it("guarda a escolha, aplica na página e avisa quem acompanha", () => {
    const onChange = vi.fn();
    const off = subscribeTheme(onChange);
    setTheme("light");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(getThemeSnapshot()).toBe("light");
    expect(onChange).toHaveBeenCalledTimes(1);
    off();
  });

  it("voltar ao automático apaga a chave", () => {
    setTheme("dark");
    setTheme("system");
    expect(window.localStorage.getItem(THEME_KEY)).toBeNull();
    expect(root.hasAttribute("data-theme")).toBe(false);
  });

  it("sobrevive a recarregar a página", () => {
    setTheme("dark");
    resetThemeStore();
    expect(getThemeSnapshot()).toBe("dark");
  });

  it("acompanha a mudança feita em outra aba", () => {
    const onChange = vi.fn();
    const off = subscribeTheme(onChange);
    getThemeSnapshot();
    window.localStorage.setItem(THEME_KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_KEY }));
    expect(getThemeSnapshot()).toBe("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(onChange).toHaveBeenCalled();
    off();
  });

  it("sem armazenamento, a escolha vale na sessão e não quebra", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    expect(() => setTheme("dark")).not.toThrow();
    expect(getThemeSnapshot()).toBe("dark");
  });
});

describe("botões de tema", () => {
  it("o botão do cabeçalho leva ao escuro quando está claro", () => {
    stubSystemDark(false);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /tema claro e escuro/i }));
    expect(getThemeSnapshot()).toBe("dark");
  });

  it("e leva ao claro quando o aparelho está escuro (automático)", () => {
    stubSystemDark(true);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /tema claro e escuro/i }));
    expect(getThemeSnapshot()).toBe("light");
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  it("o seletor do rodapé tem as três opções e marca a atual", () => {
    render(<ThemePicker />);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Automático", "Claro", "Escuro"]);
    expect(screen.getByRole("radio", { name: "Automático" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Claro" }));
    expect(screen.getByRole("radio", { name: "Claro" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Automático" })).toHaveAttribute("aria-checked", "false");
    expect(root.getAttribute("data-theme")).toBe("light");
  });
});
