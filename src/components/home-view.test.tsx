// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/lib/domain/dates";
import type { LeagueId, Match, MatchStatus, ResponseMeta, Sourced } from "@/lib/domain/types";
import { dateBounds } from "@/lib/ui/days";
import { resetFavoritesStore, setFavorites } from "@/lib/ui/favorites-store";
import { resetNowStores } from "@/lib/ui/use-now";
import { HomeView } from "./home-view";

const TODAY = "2026-10-22";

const meta: ResponseMeta = { source: "espn", sources: ["espn"], fetchedAt: "2026-10-22T15:00:00Z", cache: "hit", ttlSeconds: 30, fallback: false, missing: [], failures: [] };
const team = (key: string, name: string) => ({ id: `espn:${key}`, key, name, shortName: name, abbr: key.slice(0, 3).toUpperCase() });

function game(id: string, league: LeagueId, status: MatchStatus, home: [string, string], away: [string, string], round: string | null = null): Match {
  return {
    id: `espn:x:${id}`,
    source: "espn",
    leagueId: league,
    season: "2026",
    round,
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
  game("1", "libertadores", "live", ["flamengo", "Flamengo"], ["estudiantes", "Estudiantes"], "Oitavas de final"),
  game("2", "brasileirao-a", "scheduled", ["corinthians", "Corinthians"], ["vitoria", "Vitória"]),
  game("3", "premier-league", "finished", ["arsenal", "Arsenal"], ["chelsea", "Chelsea"]),
  game("4", "mls", "scheduled", ["miami", "Inter Miami"], ["nashville", "Nashville SC"]),
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
});

const view = (matches: Match[] = MATCHES, over: Partial<{ initialDate: string }> = {}) => render(<HomeView today={TODAY} initialDate={over.initialDate ?? TODAY} initial={initial(matches)} />);
const rows = () => screen.queryAllByRole("link").filter((l) => l.getAttribute("href")?.startsWith("/jogo/"));
const leaguesShown = () => screen.queryAllByRole("heading", { level: 2 }).map((h) => h.textContent);

function touch(el: Element, type: "touchstart" | "touchend", x: number, y: number) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const list = [{ clientX: x, clientY: y }];
  Object.defineProperty(ev, "touches", { value: type === "touchend" ? [] : list });
  Object.defineProperty(ev, "changedTouches", { value: list });
  act(() => void el.dispatchEvent(ev));
}

describe("HomeView — filtros", () => {
  it("sem nada para filtrar (nenhum jogo ao vivo, nenhum favorito), não mostra os chips", () => {
    view([MATCHES[1], MATCHES[2]]);
    expect(screen.queryByRole("group", { name: "Filtrar jogos" })).not.toBeInTheDocument();
    expect(rows()).toHaveLength(2);
  });

  it("com jogo ao vivo aparece o chip 'Ao vivo' com a contagem; filtrar mostra só ele", () => {
    view();
    expect(rows()).toHaveLength(4);
    const chip = screen.getByRole("button", { name: /Ao vivo/ });
    expect(chip).toHaveTextContent("1");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toHaveLength(1);
    expect(leaguesShown()).toEqual(["CONMEBOL Libertadores"]);
    expect(screen.getByText("1 jogo ao vivo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Todos" }));
    expect(rows()).toHaveLength(4);
  });

  it("'Favoritos' só aparece quando há jogo de time favorito no dia, e filtra por ele", () => {
    setFavorites({ teams: [{ key: "corinthians", id: "espn:874", name: "Corinthians" }], leagues: [] });
    view();
    const chip = screen.getByRole("button", { name: /Favoritos/ });
    expect(chip).toHaveTextContent("1");
    fireEvent.click(chip);
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Corinthians/ })).toBeInTheDocument();
    expect(screen.getByText("1 jogo de 4")).toBeInTheDocument();
  });

  it("'ao vivo' escolhido e o jogo acaba numa atualização: explica, o chip continua lá, e dá para voltar para todos", async () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: /Ao vivo/ }));
    expect(rows()).toHaveLength(1);

    const ended = MATCHES.map((m) => (m.status === "live" ? { ...m, status: "finished" as const } : m));
    fetchMock.mockResolvedValue(new Response(JSON.stringify(initial(ended)), { status: 200 }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Atualizar agora" }));
    });

    expect(await screen.findByText("Nenhum jogo ao vivo agora")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ao vivo/ })).toHaveAttribute("aria-pressed", "true"); // não some: dá para desligar
    fireEvent.click(screen.getByRole("button", { name: "Ver todos os jogos" }));
    expect(rows()).toHaveLength(4);
  });

  it("'favoritos' escolhido e o último favorito removido: explica e oferece ver todos", () => {
    setFavorites({ teams: [{ key: "corinthians", id: "espn:874", name: "Corinthians" }], leagues: [] });
    view();
    fireEvent.click(screen.getByRole("button", { name: /Favoritos/ }));
    expect(rows()).toHaveLength(1);

    act(() => setFavorites({ teams: [], leagues: [] }));
    expect(screen.getByText("Nenhum jogo dos seus favoritos neste dia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Favoritos/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Ver todos os jogos" }));
    expect(rows()).toHaveLength(4);
  });

  it("os filtros de status são exclusivos: escolher um desmarca o outro", () => {
    setFavorites({ teams: [{ key: "corinthians", id: "espn:874", name: "Corinthians" }], leagues: [] });
    view();
    fireEvent.click(screen.getByRole("button", { name: /Favoritos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Ao vivo/ }));
    expect(screen.getByRole("button", { name: /Favoritos/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Ao vivo/ })).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toHaveLength(1);
  });
});

describe("HomeView — busca", () => {
  const openSearch = () => fireEvent.click(screen.getByRole("button", { name: "Buscar time ou campeonato" }));
  const search = (q: string) => fireEvent.change(screen.getByRole("searchbox", { name: "Buscar time ou campeonato" }), { target: { value: q } });

  it("a lupa abre o campo; digitar filtra por time, sem ligar para acento ou caixa", () => {
    view();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    openSearch();
    search("VITÓRIA");
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("1 jogo de 4")).toBeInTheDocument();
    search("vitoria");
    expect(rows()).toHaveLength(1);
  });

  it("busca por campeonato e por várias palavras", () => {
    view();
    openSearch();
    search("premier");
    expect(leaguesShown()).toEqual(["Premier League"]);
    search("liberta fla");
    expect(leaguesShown()).toEqual(["CONMEBOL Libertadores"]);
  });

  it("nada encontrado: diz o que foi buscado e oferece limpar", () => {
    view();
    openSearch();
    search("xyz");
    expect(screen.getByText("Nada encontrado para “xyz”")).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Limpar a busca" }));
    expect(rows()).toHaveLength(4);
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("Esc e o botão de fechar limpam a busca e escondem o campo", () => {
    view();
    openSearch();
    search("fla");
    expect(rows()).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(rows()).toHaveLength(4);

    openSearch();
    search("fla");
    fireEvent.click(screen.getByRole("button", { name: "Fechar a busca" }));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(rows()).toHaveLength(4);
  });

  it("a busca combina com o filtro", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: /Ao vivo/ }));
    openSearch();
    search("corinthians"); // existe no dia, mas não está ao vivo
    expect(rows()).toHaveLength(0);
    expect(screen.getByText("Nada encontrado para “corinthians”")).toBeInTheDocument(); // com busca ativa, a mensagem é a da busca
    search("flamengo"); // ao vivo E combina
    expect(rows()).toHaveLength(1);
  });

  it("a lupa some enquanto o campo está aberto (um só controle de cada vez)", () => {
    view();
    openSearch();
    expect(screen.queryByRole("button", { name: "Buscar time ou campeonato" })).not.toBeInTheDocument();
  });
});

describe("HomeView — arrastar para trocar de dia", () => {
  const heading = () => screen.getByRole("heading", { level: 1 }).textContent ?? "";

  it("arrastar para a esquerda avança um dia e busca os jogos dele", () => {
    view();
    expect(heading()).toContain("22 de outubro");
    touch(screen.getByRole("heading", { level: 1 }), "touchstart", 300, 200);
    touch(screen.getByRole("heading", { level: 1 }), "touchend", 120, 205);
    expect(heading()).toContain("23 de outubro");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("date=2026-10-23"), expect.anything());
    expect(window.location.search).toBe("?d=2026-10-23");
  });

  it("arrastar para a direita volta um dia", () => {
    view();
    touch(screen.getByRole("heading", { level: 1 }), "touchstart", 100, 200);
    touch(screen.getByRole("heading", { level: 1 }), "touchend", 280, 195);
    expect(heading()).toContain("21 de outubro");
  });

  it("não sai da janela de datas que a API aceita", () => {
    const { min, max } = dateBounds(TODAY);
    view(MATCHES, { initialDate: min });
    touch(screen.getByRole("heading", { level: 1 }), "touchstart", 100, 200);
    touch(screen.getByRole("heading", { level: 1 }), "touchend", 280, 200);
    expect(heading()).not.toContain(addDays(min, -1).slice(8));
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining(`date=${addDays(min, -1)}`), expect.anything());
    cleanup();
    view(MATCHES, { initialDate: max });
    touch(screen.getByRole("heading", { level: 1 }), "touchstart", 300, 200);
    touch(screen.getByRole("heading", { level: 1 }), "touchend", 100, 200);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining(`date=${addDays(max, 1)}`), expect.anything());
  });

  it("não troca de dia se o gesto começa no campo de busca ou na faixa de dias", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Buscar time ou campeonato" }));
    const campo = screen.getByRole("searchbox");
    touch(campo, "touchstart", 300, 200);
    touch(campo, "touchend", 100, 200);
    const faixa = screen.getByRole("navigation", { name: "Escolher o dia" });
    touch(faixa, "touchstart", 300, 200);
    touch(faixa, "touchend", 100, 200);
    expect(heading()).toContain("22 de outubro");
  });

  it("rolar a página (vertical) não troca de dia", () => {
    view();
    const h1 = screen.getByRole("heading", { level: 1 });
    touch(h1, "touchstart", 200, 100);
    touch(h1, "touchend", 215, 520);
    expect(heading()).toContain("22 de outubro");
  });
});

describe("HomeView — estados", () => {
  it("dia sem jogos: não mostra filtros nem busca vazia de sentido", () => {
    view([]);
    expect(screen.getByText("Nenhum jogo neste dia")).toBeInTheDocument();
  });

  it("os jogos continuam agrupados por campeonato na ordem do catálogo", () => {
    view();
    expect(leaguesShown()).toEqual(["Campeonato Brasileiro Série A", "CONMEBOL Libertadores", "Premier League", "MLS"]);
  });

  it("competição nova (MLS) aparece e leva à própria página", () => {
    view();
    const mls = screen.getByRole("heading", { level: 2, name: "MLS" });
    expect(within(mls).getByRole("link")).toHaveAttribute("href", "/liga/mls");
  });
});

describe("HomeView — telas largas (lista + detalhe ao lado)", () => {
  const stubWidth = (px: number) =>
    vi.stubGlobal("matchMedia", (q: string) => {
      const min = Number(/min-width:\s*(\d+)px/.exec(q)?.[1] ?? 0);
      return { matches: px >= min, media: q, addEventListener: () => {}, removeEventListener: () => {} };
    });

  it("no celular não há detalhe ao lado nem 'Ao vivo agora', e tocar no jogo abre a página normalmente", () => {
    view();
    expect(screen.queryByRole("complementary", { name: "Detalhe do jogo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Ao vivo agora/ })).not.toBeInTheDocument();
    const notPrevented = fireEvent.click(rows()[0]);
    expect(notPrevented).toBe(true); // o link segue o seu caminho
  });

  it("em tela larga, tocar no jogo abre o detalhe ao lado, sem trocar de página", async () => {
    stubWidth(1000);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Sem rede." } }), { status: 502 }));
    view();
    expect(screen.getByRole("complementary", { name: "Detalhe do jogo" })).toHaveTextContent("Escolha um jogo na lista");
    const row = screen.getByRole("link", { name: /Corinthians/ });
    let notPrevented = true;
    await act(async () => {
      notPrevented = fireEvent.click(row);
    });
    expect(notPrevented).toBe(false); // o clique foi tratado pela página
    expect(fetchMock).toHaveBeenCalledWith("/api/matches/espn:x:2", expect.anything());
    expect(screen.getByRole("link", { name: /Corinthians/ })).toHaveAttribute("aria-current", "true");
  });

  it("ctrl+clique continua abrindo o jogo em outra aba", () => {
    stubWidth(1000);
    view();
    expect(fireEvent.click(rows()[0], { ctrlKey: true })).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mostra 'Ao vivo agora' com os jogos em andamento", () => {
    stubWidth(1000);
    view();
    expect(screen.getByRole("heading", { name: /Ao vivo agora/ })).toBeInTheDocument();
  });

  it("a partir de 1200 px dá para trocar para o modo painel (e voltar à lista)", () => {
    stubWidth(1440);
    view();
    fireEvent.click(screen.getByRole("button", { name: "Painel" }));
    expect(screen.getByRole("heading", { name: "A seguir" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Detalhe do jogo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lista" }));
    expect(screen.queryByRole("heading", { name: "A seguir" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Detalhe do jogo" })).toBeInTheDocument();
  });

  it("entre 900 e 1199 px não há botão de painel", () => {
    stubWidth(1000);
    view();
    expect(screen.queryByRole("button", { name: "Painel" })).not.toBeInTheDocument();
  });
});
