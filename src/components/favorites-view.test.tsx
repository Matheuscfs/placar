// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetFavoritesStore, setFavorites } from "@/lib/ui/favorites-store";
import { FavoritesView } from "./favorites-view";

beforeEach(() => {
  localStorage.clear();
  resetFavoritesStore();
});
afterEach(cleanup);

describe("FavoritesView", () => {
  it("no HTML do servidor NÃO afirma 'nenhum time' (o servidor não enxerga o localStorage)", () => {
    const html = renderToString(<FavoritesView />);
    expect(html).not.toContain("ainda não favoritou");
    expect(html).toContain("Times");
    expect(html).toContain("Ligas");
  });

  it("depois de hidratar, sem favoritos, mostra o convite para favoritar", () => {
    render(<FavoritesView />);
    expect(screen.getByText(/ainda não favoritou nenhum time/i)).toBeInTheDocument();
  });

  it("depois de hidratar, lista os times salvos, com link para a página do time", () => {
    setFavorites({ teams: [{ key: "corinthians", id: "espn:874", name: "Corinthians" }], leagues: [] });
    render(<FavoritesView />);
    expect(screen.queryByText(/ainda não favoritou/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /corinthians/i })).toHaveAttribute("href", "/time/espn:874");
  });
});
