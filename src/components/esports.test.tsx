// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "@/lib/esports/__fixtures__/matches.json";
import { convertMatches } from "@/lib/esports/pandascore";
import type { EsportsResult } from "@/lib/esports/types";
import { resetNowStores } from "@/lib/ui/use-now";
import { EsportsRow } from "./esports-row";
import { EsportsView } from "./esports-view";

afterEach(() => {
  cleanup();
  resetNowStores();
  vi.unstubAllGlobals();
});

const matches = convertMatches(fixture as unknown[]);
const byId = (id: number) => matches.find((m) => m.id === `pandascore:${id}`)!;

describe("EsportsRow", () => {
  it("encerrada: nomes, placar, 'Encerrada', fase e formato; o perdedor fica mais suave; sem links de transmissão", () => {
    render(<EsportsRow match={byId(1001)} />);
    const row = screen.getByRole("article", { name: "Alpha Esports 2, Bravo Gaming 1, encerrada, melhor de 3" });
    expect(within(row).getByText("Alpha Esports")).toHaveClass("font-semibold");
    expect(within(row).getByText("Bravo Gaming")).toHaveClass("text-muted");
    expect(within(row).getByText("2")).toBeInTheDocument();
    expect(within(row).getByText("1")).toBeInTheDocument();
    expect(within(row).getByText("Encerrada")).toBeInTheDocument();
    expect(within(row).getByText("Playoffs · MD3")).toBeInTheDocument();
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
  });

  it("em andamento: 'Em andamento' e links de transmissão que abrem em outra aba com rel seguro", () => {
    render(<EsportsRow match={byId(1002)} />);
    expect(screen.getByText("Em andamento")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Assistir na YouTube (abre em outra aba)" });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("Assistir · YouTube");
  });

  it("agendada com adversário indefinido: horário de Brasília e 'A definir', sem placar", () => {
    render(<EsportsRow match={byId(1003)} />);
    expect(screen.getByText("23:00")).toBeInTheDocument(); // 02:00 UTC do dia 23 = 23:00 do dia 22 em Brasília
    expect(screen.getByText("A definir")).toBeInTheDocument();
    expect(screen.getByText("Echo Club")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("adiada, cancelada e W.O.", () => {
    const { rerender } = render(<EsportsRow match={byId(1004)} />);
    expect(screen.getByText("Adiada")).toBeInTheDocument();
    rerender(<EsportsRow match={byId(1005)} />);
    expect(screen.getByText("Cancelada")).toBeInTheDocument();
    rerender(<EsportsRow match={byId(1006)} />);
    expect(screen.getByText("W.O.")).toBeInTheDocument();
  });

  it("duas transmissões: mostra as duas, só com o nome da plataforma", () => {
    const m = { ...byId(1002), streams: [{ url: "https://www.twitch.tv/a", language: "pt", official: true, main: true }, { url: "https://www.youtube.com/watch?v=1", language: "pt", official: false, main: false }] };
    render(<EsportsRow match={m} />);
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Twitch", "YouTube"]);
  });
});

describe("EsportsView", () => {
  const TODAY = "2026-10-22";
  const initial: EsportsResult = { data: matches, meta: { source: "pandascore", fetchedAt: "2026-10-22T15:00:00Z", cache: "hit", ttlSeconds: 60, truncated: false } };
  const view = (over: Partial<Parameters<typeof EsportsView>[0]> = {}) => render(<EsportsView today={TODAY} initialDate={TODAY} initialGame="todos" initial={initial} {...over} />);

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "sem rede" } }), { status: 503 })));
  });

  it("abre com os torneios principais e diz quantas partidas escondeu", () => {
    view();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("E-sports");
    expect(screen.getAllByRole("article")).toHaveLength(3); // 1001 (S), 1002 (A), 1003 (B)
    expect(screen.getByText("(4 ocultas)")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: /Só torneios principais/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("heading", { name: /Liga Aurora/ })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Open Menor/ })).not.toBeInTheDocument();
  });

  it("desligar o filtro mostra tudo, e o interruptor lembra a escolha", () => {
    view();
    fireEvent.click(screen.getByRole("switch", { name: /Só torneios principais/ }));
    expect(screen.getAllByRole("article")).toHaveLength(7);
    expect(screen.getByRole("switch", { name: /Só torneios principais/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText(/ocultas?\)/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Open Menor/ })).toBeInTheDocument();
  });

  it("trocar de jogo é instantâneo (filtra no navegador, sem nova busca)", () => {
    view();
    fireEvent.click(screen.getByRole("tab", { name: "LoL" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "LoL" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Valorant" }));
    expect(screen.getByText("Echo Club")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("jogo inicial vem da URL", () => {
    view({ initialGame: "valorant" });
    expect(screen.getByRole("tab", { name: "Valorant" })).toHaveAttribute("aria-selected", "true");
  });

  it("conta as partidas em andamento", () => {
    view();
    expect(screen.getByText("1 em andamento")).toBeInTheDocument();
  });

  it("dia sem partidas: mensagem clara, sem filtro", () => {
    view({ initial: { ...initial, data: [] } });
    expect(screen.getByText("Nenhuma partida neste dia")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("dia só com torneios menores: o automático já mostra tudo; ligar o filtro explica e oferece mostrar todas", () => {
    view({ initial: { ...initial, data: matches.filter((m) => m.tier === "D" || m.tier === "unranked") } });
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getByRole("switch", { name: /Só torneios principais/ })).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("switch", { name: /Só torneios principais/ }));
    expect(screen.getByText("Só há partidas de torneios menores")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar todas" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("jogo sem partidas no dia: diz o jogo", () => {
    view({ initial: { ...initial, data: matches.filter((m) => m.game !== "valorant") }, initialGame: "valorant" });
    expect(screen.getByText("Nenhuma partida de Valorant neste dia")).toBeInTheDocument();
  });

  it("dados velhos e lista cortada viram aviso", () => {
    view({ initial: { ...initial, meta: { ...initial.meta, cache: "stale", truncated: true } } });
    const status = screen.getByRole("status", { name: "" });
    expect(status).toHaveTextContent(/não respondeu agora/);
    expect(status).toHaveTextContent(/partidas demais/);
  });

  it("sem dados iniciais e com a busca falhando: erro com 'Tentar de novo'", async () => {
    view({ initial: null });
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as partidas");
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });

  it("explica o limite da fonte gratuita", () => {
    view();
    expect(screen.getByText(/não garante placar ao vivo/)).toBeInTheDocument();
  });
});
