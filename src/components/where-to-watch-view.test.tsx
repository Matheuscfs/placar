// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeagueId, Match, MatchStatus, ResponseMeta, Sourced } from "@/lib/domain/types";
import { resetFavoritesStore } from "@/lib/ui/favorites-store";
import { resetNowStores } from "@/lib/ui/use-now";
import { AppHeader } from "./app-header";
import { WhereToWatchView } from "./where-to-watch-view";

const TODAY = "2026-10-22";
const meta: ResponseMeta = { source: "espn", sources: ["espn"], fetchedAt: "2026-10-22T15:00:00Z", cache: "hit", ttlSeconds: 30, fallback: false, missing: [], failures: [] };
const team = (key: string, name: string) => ({ id: `espn:${key}`, key, name, shortName: name, abbr: key.slice(0, 3).toUpperCase() });

function game(id: string, league: LeagueId, status: MatchStatus, home: [string, string], away: [string, string]): Match {
  return {
    id: `espn:x:${id}`,
    source: "espn",
    leagueId: league,
    season: "2026",
    round: null,
    kickoff: "2026-10-22T22:00:00Z",
    status,
    statusText: null,
    clock: status === "live" ? "30'" : null,
    home: { team: team(...home), score: status === "scheduled" ? null : 1, penalties: null, aggregate: null },
    away: { team: team(...away), score: status === "scheduled" ? null : 0, penalties: null, aggregate: null },
    venue: null,
  };
}

const MATCHES: Match[] = [
  game("1", "libertadores", "scheduled", ["flamengo", "Flamengo"], ["estudiantes", "Estudiantes"]),
  game("2", "premier-league", "live", ["arsenal", "Arsenal"], ["chelsea", "Chelsea"]),
  game("3", "mls", "scheduled", ["miami", "Inter Miami"], ["nashville", "Nashville SC"]),
  game("4", "brasileirao-a", "finished", ["corinthians", "Corinthians"], ["vitoria", "Vitória"]),
];
const initial = (matches: Match[]): Sourced<Match[]> => ({ data: matches, meta });

let fetchMock: ReturnType<typeof vi.fn<(url: string) => Promise<Response>>>;
beforeEach(() => {
  resetFavoritesStore();
  localStorage.clear();
  fetchMock = vi.fn(async () => new Response(JSON.stringify(initial([])), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  resetNowStores();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const view = (matches: Match[] = MATCHES) => render(<WhereToWatchView today={TODAY} initialDate={TODAY} initial={initial(matches)} />);
const sections = () => screen.queryAllByRole("region").map((s) => within(s).getByRole("heading", { level: 2 }).textContent);
const rows = () => screen.queryAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("/jogo/"));

describe("WhereToWatchView", () => {
  it("lista os jogos por campeonato com os canais de cada um, e avisa que o canal exato pode ser outro", () => {
    view();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Onde assistir");
    expect(screen.getByText(/costuma/)).toBeInTheDocument();
    expect(screen.getByText(/confirme na emissora/)).toBeInTheDocument();

    const lib = screen.getByRole("region", { name: "CONMEBOL Libertadores" });
    expect(lib).toHaveTextContent("Costuma passar em ESPN, Disney+, TV Globo, Paramount+");
    expect(within(lib).getByText(/O canal muda de jogo para jogo/)).toBeInTheDocument();
    expect(within(lib).getByRole("link", { name: /Flamengo/ })).toHaveAttribute("href", "/jogo/espn:x:1");
  });

  it("competição sem catálogo de canais diz isso em vez de inventar", () => {
    view();
    const mls = screen.getByRole("region", { name: "MLS" });
    expect(mls).toHaveTextContent("Sem informação de transmissão para esta competição");
    expect(mls).not.toHaveTextContent("Costuma passar em");
  });

  it("esconde os jogos encerrados por padrão, conta quantos e mostra se a pessoa pedir", () => {
    view();
    expect(sections()).toEqual(["CONMEBOL Libertadores", "Premier League", "MLS"]);
    expect(rows()).toHaveLength(3);
    expect(screen.getByText("(1 ocultos)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: /Incluir jogos encerrados/ }));
    expect(sections()).toEqual(["Campeonato Brasileiro Série A", "CONMEBOL Libertadores", "Premier League", "MLS"]);
    expect(rows()).toHaveLength(4);
    expect(screen.getByRole("switch", { name: /Incluir jogos encerrados/ })).toHaveAttribute("aria-checked", "true");
  });

  it("a busca filtra por time e por campeonato, sem ligar para acento", () => {
    view();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar time ou campeonato" }), { target: { value: "ARSENAL" } }); // maiúsculas; o acento é coberto nos testes de filtro
    expect(sections()).toEqual(["Premier League"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "liberta" } });
    expect(sections()).toEqual(["CONMEBOL Libertadores"]);
  });

  it("o filtro de campeonato lista só os que têm jogo no dia (visível) e filtra", () => {
    view();
    const select = screen.getByRole("combobox", { name: "Campeonato" });
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Todos os campeonatos", "CONMEBOL Libertadores", "Premier League", "MLS"]); // sem o Brasileirão: só tem jogo encerrado
    fireEvent.change(select, { target: { value: "mls" } });
    expect(sections()).toEqual(["MLS"]);
  });

  it("filtros sem resultado: explica e limpa tudo", () => {
    view();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "xyz" } });
    expect(screen.getByText("Nada encontrado para “xyz”")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpar os filtros" }));
    expect(rows()).toHaveLength(3);
  });

  it("campeonato escolhido que perde os jogos (ligar/desligar encerrados) não deixa o filtro preso", () => {
    view();
    fireEvent.click(screen.getByRole("switch", { name: /Incluir jogos encerrados/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Campeonato" }), { target: { value: "brasileirao-a" } });
    expect(sections()).toEqual(["Campeonato Brasileiro Série A"]);
    fireEvent.click(screen.getByRole("switch", { name: /Incluir jogos encerrados/ })); // o Brasileirão só tem jogo encerrado
    expect(screen.getByRole("combobox", { name: "Campeonato" })).toHaveValue("");
    expect(rows()).toHaveLength(3);
  });

  it("todos os jogos do dia já terminaram: diz isso e oferece mostrar os encerrados", () => {
    view([MATCHES[3]]);
    expect(screen.getByText("Todos os jogos deste dia já terminaram")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar os encerrados" }));
    expect(rows()).toHaveLength(1);
  });

  it("dia sem jogos", () => {
    view([]);
    expect(screen.getByText("Nenhum jogo neste dia")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("arrastar troca de dia e busca os jogos do novo dia; a URL acompanha", () => {
    view();
    const touch = (el: Element, type: string, x: number) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      const list = [{ clientX: x, clientY: 200 }];
      Object.defineProperty(ev, "touches", { value: type === "touchend" ? [] : list });
      Object.defineProperty(ev, "changedTouches", { value: list });
      act(() => void el.dispatchEvent(ev));
    };
    const h1 = screen.getByRole("heading", { level: 1 });
    touch(h1, "touchstart", 300);
    touch(h1, "touchend", 100);
    expect(h1).toHaveTextContent("23 de outubro");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("date=2026-10-23"), expect.anything());
    expect(window.location.pathname + window.location.search).toBe("/onde-assistir?d=2026-10-23");
  });
});

describe("AppHeader", () => {
  it("tem o link 'Onde assistir'; 'E-sports' só quando a fonte está configurada; Favoritos tem nome acessível mesmo só com a estrela", () => {
    vi.stubEnv("PANDASCORE_TOKEN", "");
    const { unmount } = render(<AppHeader />);
    expect(screen.getByRole("link", { name: "Onde assistir" })).toHaveAttribute("href", "/onde-assistir");
    expect(screen.queryByRole("link", { name: "E-sports" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Favoritos" })).toHaveAttribute("href", "/favoritos");
    unmount();

    vi.stubEnv("PANDASCORE_TOKEN", "t");
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "E-sports" })).toHaveAttribute("href", "/esports");
  });
});
