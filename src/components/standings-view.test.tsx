// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leagueById } from "@/lib/ui/leagues";
import { resetNowStores } from "@/lib/ui/use-now";
import { StandingsView } from "./standings-view";

let fetchMock: ReturnType<typeof vi.fn<(url: string) => Promise<Response>>>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Fonte fora do ar." } }), { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  resetNowStores();
  vi.unstubAllGlobals();
});

describe("StandingsView", () => {
  it("competição sem tabela (copa): explica, leva aos jogos e NÃO busca nada na rede", () => {
    render(<StandingsView league={leagueById("fa-cup")!} initial={null} noTable />);
    expect(screen.getByRole("heading", { level: 1, name: "FA Cup" })).toBeInTheDocument();
    expect(screen.getByText("Esta competição não tem tabela de classificação")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver os jogos de hoje" })).toHaveAttribute("href", "/");
    expect(screen.queryByText("Não foi possível carregar a classificação")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falha de verdade (fonte fora do ar): continua sendo erro, com 'Tentar de novo'", async () => {
    render(<StandingsView league={leagueById("brasileirao-a")!} initial={null} />);
    expect(await screen.findByText("Não foi possível carregar a classificação")).toBeInTheDocument();
    expect(screen.getByText("Fonte fora do ar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
    expect(screen.queryByText("Esta competição não tem tabela de classificação")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/standings/brasileirao-a", expect.anything());
  });
});
