// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import summary from "@/lib/data/sources/espn/__fixtures__/summary-upcoming-form-h2h.json";
import { toMatchDetail } from "@/lib/data/sources/espn/convert";
import type { EspnSummary } from "@/lib/data/sources/espn/espn-types";
import type { MatchDetail, MatchStatus, ResponseMeta, Sourced } from "@/lib/domain/types";
import { resetNowStores } from "@/lib/ui/use-now";
import { Countdown } from "./match/countdown";
import { MatchContext } from "./match/match-context";
import { MatchView } from "./match-view";

const real = (): MatchDetail => toMatchDetail(summary as unknown as EspnSummary, "libertadores", "conmebol.libertadores", "401912521")!;
const meta: ResponseMeta = { source: "espn", sources: ["espn"], fetchedAt: "2026-10-22T20:00:00Z", cache: "hit", ttlSeconds: 20, fallback: false, missing: [], failures: [] };
const sourced = (m: MatchDetail): Sourced<MatchDetail> => ({ data: m, meta });

afterEach(() => {
  cleanup();
  resetNowStores();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MatchContext (dados reais da ESPN)", () => {
  it("mostra a forma dos DOIS times, com a letra de cada resultado e o resumo falado", () => {
    render(<MatchContext m={real()} />);
    const como = screen.getByRole("region", { name: "Como cada um chega" });
    expect(within(como).getByRole("heading", { level: 3, name: "Flamengo" })).toBeInTheDocument();
    expect(within(como).getByRole("heading", { level: 3, name: "Estudiantes de La Plata" })).toBeInTheDocument();
    expect(within(como).getByRole("img", { name: "Últimos 5 jogos, do mais recente para o mais antigo: 3 vitórias, 2 empates, nenhuma derrota" })).toBeInTheDocument();
    expect(within(como).getByRole("img", { name: "Últimos 5 jogos, do mais recente para o mais antigo: 1 vitória, 2 empates, 2 derrotas" })).toBeInTheDocument();
    // Flamengo: V (Bahia), E (Estudiantes), V (Fluminense), E (Santos), V (Bragantino)
    const flaChips = within(como).getAllByRole("img")[0].textContent;
    expect(flaChips).toBe("VEVEV");
  });

  it("lista os jogos de cada time: contra quem, onde (casa ou fora), placar do ponto de vista dele e a data", () => {
    render(<MatchContext m={real()} />);
    const como = screen.getByRole("region", { name: "Como cada um chega" });
    const bahia = within(como).getByText("Bahia").closest("li")!;
    expect(bahia).toHaveTextContent("@"); // jogou fora
    expect(bahia).toHaveTextContent("3 – 0");
    expect(within(bahia).getByText(/vitória/)).toBeInTheDocument(); // só para leitor de tela
    const bragantino = within(como).getByText("Red Bull Bragantino").closest("li")!;
    expect(bragantino).toHaveTextContent("vs");
    expect(bragantino).toHaveTextContent("2 – 1");
    const sanLorenzo = within(como).getByText("San Lorenzo").closest("li")!;
    expect(sanLorenzo).toHaveTextContent("1 – 2"); // o Estudiantes fez 1 e tomou 2
    expect(within(sanLorenzo).getByText(/derrota/)).toBeInTheDocument();
  });

  it("últimos confrontos: saldo calculado dos jogos exibidos e a lista, do mais recente ao mais antigo", () => {
    render(<MatchContext m={real()} />);
    const conf = screen.getByRole("region", { name: "Últimos confrontos" });
    expect(conf).toHaveTextContent("Flamengo 2 · empates 2 · Estudiantes de La Plata 1");
    const items = within(conf).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("Estudiantes de La Plata0 – 0Flamengo");
    expect(items[1]).toHaveTextContent("Flamengo1 – 0Estudiantes de La Plata");
  });

  it("sem forma e sem confrontos: não desenha nada (nunca uma lista vazia que pareça 'sem jogos')", () => {
    const m = real();
    delete m.form;
    delete m.headToHead;
    const { container } = render(<MatchContext m={m} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("só confrontos, ou só a forma de um time: mostra o que veio", () => {
    const onlyH2H = real();
    delete onlyH2H.form;
    render(<MatchContext m={onlyH2H} />);
    expect(screen.queryByRole("region", { name: "Como cada um chega" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Últimos confrontos" })).toBeInTheDocument();
    cleanup();

    const oneTeam = real();
    oneTeam.form = oneTeam.form!.filter((f) => f.side === "home");
    delete oneTeam.headToHead;
    render(<MatchContext m={oneTeam} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Últimos confrontos" })).not.toBeInTheDocument();
  });
});

describe("Countdown", () => {
  beforeEach(() => vi.useFakeTimers());
  const kickoff = "2026-10-23T00:30:00Z";
  const at = (iso: string) => vi.setSystemTime(new Date(iso));

  it("mostra quanto falta e se atualiza sozinho", async () => {
    at("2026-10-22T20:45:00Z");
    render(<Countdown kickoff={kickoff} />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(screen.getByText("Começa em 3 h 45 min")).toBeInTheDocument();
    await act(async () => void (await vi.advanceTimersByTimeAsync(31 * 60_000)));
    expect(screen.getByText("Começa em 3 h 14 min")).toBeInTheDocument();
  });

  it("hora passada (jogo atrasado): não mostra contagem", async () => {
    at("2026-10-23T00:40:00Z");
    const { container } = render(<Countdown kickoff={kickoff} />);
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(container.textContent).toBe("");
  });

  it("antes de o relógio do navegador entrar (servidor), não escreve nada, mas já reserva a altura", () => {
    at("2026-10-22T20:45:00Z");
    const { container } = render(<Countdown kickoff={kickoff} />);
    expect(container.querySelector("p")).toHaveClass("h-5");
  });
});

describe("MatchView com forma, confrontos, contagem e texto", () => {
  const view = (m: MatchDetail) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    return render(<MatchView id={m.id} initial={sourced(m)} />);
  };
  const withStatus = (status: MatchStatus, over: Partial<MatchDetail> = {}): MatchDetail => ({ ...real(), status, ...over });

  it("antes do jogo: contagem, 'Como cada um chega' ANTES da mensagem de que não há lances, e o texto 'Sobre a partida'", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T20:45:00Z"));
    view(real());
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(screen.getByText("Começa em 3 h 45 min")).toBeInTheDocument();

    const como = screen.getByRole("region", { name: "Como cada um chega" });
    const vazio = screen.getByText("Sem lances por enquanto");
    expect(como.compareDocumentPosition(vazio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const sobre = screen.getByRole("region", { name: "Sobre a partida" });
    expect(sobre).toHaveTextContent(/Flamengo e Estudiantes de La Plata se enfrentam em 22\/10\/2026, às 21h30 \(horário de Brasília\)/);
    expect(sobre).toHaveTextContent("válida por CONMEBOL Libertadores");
  });

  it("depois do jogo: os lances vêm primeiro e o contexto fica abaixo; sem contagem; texto de resultado", () => {
    const m = withStatus("finished", {
      events: [{ id: "e1", type: "goal", minute: 30, clock: "30'", side: "home", player: "Fulano", secondaryPlayer: null, text: null, score: { home: 1, away: 0 } }],
    });
    m.home.score = 1;
    m.away.score = 0;
    view(m);
    expect(screen.queryByText(/Começa em/)).not.toBeInTheDocument();
    const como = screen.getByRole("region", { name: "Como cada um chega" });
    const lance = screen.getByText("Fulano");
    expect(lance.compareDocumentPosition(como) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("region", { name: "Sobre a partida" })).toHaveTextContent("Terminou Flamengo 1 x 0 Estudiantes de La Plata em 22/10/2026");
  });

  it("sem forma nem confrontos (outras fontes): a página continua igual, sem as seções", () => {
    const m = real();
    delete m.form;
    delete m.headToHead;
    view(m);
    expect(screen.queryByRole("region", { name: "Como cada um chega" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sobre a partida" })).toBeInTheDocument();
  });
});
