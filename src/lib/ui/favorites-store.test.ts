// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FAVORITES, FAVORITES_KEY, toggleLeague, toggleTeam } from "./favorites";
import { getFavoritesSnapshot, getServerFavoritesSnapshot, resetFavoritesStore, setFavorites, subscribeFavorites } from "./favorites-store";

const cor = { key: "corinthians", id: "espn:874", name: "Corinthians" };

beforeEach(() => {
  window.localStorage.clear();
  resetFavoritesStore();
});
afterEach(() => vi.restoreAllMocks());

describe("armazenamento de favoritos", () => {
  it("começa vazio e devolve SEMPRE a mesma referência enquanto nada muda (evita render à toa)", () => {
    expect(getFavoritesSnapshot()).toBe(EMPTY_FAVORITES);
    expect(getFavoritesSnapshot()).toBe(getFavoritesSnapshot());
  });

  it("no servidor não há favoritos", () => {
    expect(getServerFavoritesSnapshot()).toBe(EMPTY_FAVORITES);
  });

  it("salva no localStorage, avisa quem acompanha e troca a referência", () => {
    const onChange = vi.fn();
    const off = subscribeFavorites(onChange);
    const before = getFavoritesSnapshot();
    setFavorites(toggleTeam(before, cor));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getFavoritesSnapshot()).not.toBe(before);
    expect(getFavoritesSnapshot().teams).toEqual([cor]);
    expect(JSON.parse(window.localStorage.getItem(FAVORITES_KEY)!).teams).toEqual([cor]);
    off();
  });

  it("sobrevive a recarregar a página (lê o que estava salvo)", () => {
    setFavorites(toggleLeague(EMPTY_FAVORITES, "libertadores"));
    resetFavoritesStore(); // como se a página tivesse sido recarregada
    expect(getFavoritesSnapshot().leagues).toEqual(["libertadores"]);
  });

  it("zerar os favoritos apaga a chave (não deixa lixo)", () => {
    setFavorites(toggleLeague(EMPTY_FAVORITES, "libertadores"));
    setFavorites(EMPTY_FAVORITES);
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();
  });

  it("acompanha mudanças feitas em outra aba (evento storage)", () => {
    const onChange = vi.fn();
    const off = subscribeFavorites(onChange);
    getFavoritesSnapshot();
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify({ teams: [cor], leagues: [] }));
    window.dispatchEvent(new StorageEvent("storage", { key: FAVORITES_KEY }));
    expect(onChange).toHaveBeenCalled();
    expect(getFavoritesSnapshot().teams).toEqual([cor]);
    off();
  });

  it("ignora o evento storage de outras chaves", () => {
    const onChange = vi.fn();
    const off = subscribeFavorites(onChange);
    window.dispatchEvent(new StorageEvent("storage", { key: "outra-coisa" }));
    expect(onChange).not.toHaveBeenCalled();
    off();
  });

  it("quem para de acompanhar não é mais avisado", () => {
    const onChange = vi.fn();
    subscribeFavorites(onChange)();
    setFavorites(toggleTeam(EMPTY_FAVORITES, cor));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("se o armazenamento falhar (aba privada, bloqueio), os favoritos valem na sessão", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    expect(() => setFavorites(toggleTeam(EMPTY_FAVORITES, cor))).not.toThrow();
    expect(getFavoritesSnapshot().teams).toEqual([cor]);
  });

  it("se a leitura falhar, começa vazio sem quebrar", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(getFavoritesSnapshot()).toBe(EMPTY_FAVORITES);
  });

  it("dado corrompido no armazenamento é ignorado", () => {
    window.localStorage.setItem(FAVORITES_KEY, "{isso não é json");
    expect(getFavoritesSnapshot()).toBe(EMPTY_FAVORITES);
  });
});
