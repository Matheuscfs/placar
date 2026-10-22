// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Lineup, Match, MatchEvent, StandingRow, StandingsGroup, StatLine, Team } from "@/lib/domain/types";
import { statusView } from "@/lib/ui/format";
import { Crest } from "./crest";
import { DayStrip } from "./day-strip";
import { FavoriteButton } from "./favorite-button";
import { MatchRow } from "./match-row";
import { LineupBlock } from "./match/lineups";
import { MatchStats, homeShare } from "./match/match-stats";
import { Timeline } from "./match/timeline";
import { ScoreNumber } from "./score-number";
import { StandingsTable, ZoneLegend, signed } from "./standings-table";
import { StateMessage } from "./state-message";
import { StatusCell } from "./status-cell";
import { Tabs } from "./tabs";

afterEach(cleanup);

const team = (key: string, over: Partial<Team> = {}): Team => ({ id: `espn:${key}`, key, name: key[0].toUpperCase() + key.slice(1), shortName: key, abbr: key.slice(0, 3).toUpperCase(), ...over });

function match(over: Omit<Partial<Match>, "home" | "away"> & { home?: Partial<Match["home"]>; away?: Partial<Match["away"]> } = {}): Match {
  const { home, away, ...rest } = over;
  return {
    id: "espn:bra.1:1",
    source: "espn",
    leagueId: "brasileirao-a",
    season: "2026",
    round: null,
    kickoff: "2026-10-24T19:30:00Z",
    status: "scheduled",
    statusText: null,
    clock: null,
    home: { team: team("corinthians"), score: null, penalties: null, aggregate: null, ...home },
    away: { team: team("vitoria"), score: null, penalties: null, aggregate: null, ...away },
    venue: null,
    ...rest,
  };
}

describe("MatchRow", () => {
  it("jogo agendado: horário no lugar do placar, link para o jogo e descrição falada", () => {
    render(<MatchRow match={match()} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/jogo/espn:bra.1:1");
    expect(link).toHaveAccessibleName("Corinthians contra Vitoria, às 16:30");
    expect(screen.getByText("16:30")).toBeInTheDocument();
    expect(link.querySelector(".score")).toBeNull();
  });

  it("encerrado: placares à direita e o PERDEDOR suavizado (peso e cor)", () => {
    render(<MatchRow match={match({ status: "finished", statusText: "Encerrado", home: { score: 2 }, away: { score: 1 } })} />);
    expect(screen.getByText("Corinthians")).toHaveClass("font-semibold");
    expect(screen.getByText("Vitoria")).toHaveClass("text-muted");
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Fim")).toBeInTheDocument();
  });

  it("empate: nenhum dos dois é suavizado", () => {
    render(<MatchRow match={match({ status: "finished", home: { score: 1 }, away: { score: 1 } })} />);
    expect(screen.getByText("Corinthians")).toHaveClass("font-semibold");
    expect(screen.getByText("Vitoria")).toHaveClass("font-semibold");
  });

  it("ao vivo: relógio com o ponto que pulsa, e o tempo de jogo como apoio", () => {
    const { container } = render(<MatchRow match={match({ status: "live", clock: "67'", statusText: "2º tempo", home: { score: 1 }, away: { score: 0 } })} />);
    expect(screen.getByText("67'")).toBeInTheDocument();
    expect(screen.getByText("2º tempo")).toBeInTheDocument();
    expect(container.querySelector(".live-dot")).not.toBeNull();
    expect(screen.getByRole("link")).toHaveAccessibleName("Corinthians 1 x 0 Vitoria, Ao vivo, 67', 2º tempo");
  });

  it("intervalo mostra a palavra e NÃO tem o ponto que pulsa", () => {
    const { container } = render(<MatchRow match={match({ status: "halftime", home: { score: 0 }, away: { score: 0 } })} />);
    expect(screen.getByText("Intervalo")).toBeInTheDocument();
    expect(container.querySelector(".live-dot")).toBeNull();
  });

  it("pênaltis aparecem entre parênteses ao lado do placar", () => {
    render(<MatchRow match={match({ status: "finished", statusText: "Encerrado (pênaltis)", home: { score: 1, penalties: 3 }, away: { score: 1, penalties: 5 } })} />);
    expect(screen.getByText("(3)")).toBeInTheDocument();
    expect(screen.getByText("(5)")).toBeInTheDocument();
    expect(screen.getByText("pênaltis")).toBeInTheDocument();
  });

  it("adiado: sem placar, com a palavra", () => {
    const { container } = render(<MatchRow match={match({ status: "postponed", home: { score: 0 }, away: { score: 0 } })} />);
    expect(screen.getByText("Adiado")).toBeInTheDocument();
    expect(container.querySelector(".score")).toBeNull();
  });

  it("time favorito ganha uma estrela discreta", () => {
    const { container } = render(<MatchRow match={match()} isFavorite={(k) => k === "vitoria"} />);
    expect(container.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(1);
  });

  it("em listas de vários dias o jogo agendado mostra a data", () => {
    render(<MatchRow match={match()} showDate />);
    expect(screen.getByText("sáb 24 out")).toBeInTheDocument();
  });
});

describe("StatusCell", () => {
  const view = (status: Match["status"], over: Partial<Match> = {}) => statusView({ status, clock: null, statusText: null, kickoff: "2026-10-24T19:30:00Z", ...over });

  it("só o jogo em andamento usa a cor do 'ao vivo'", () => {
    const { container, rerender } = render(<StatusCell status={view("live", { clock: "10'" })} />);
    expect(container.querySelector(".text-live")).not.toBeNull();
    rerender(<StatusCell status={view("finished")} />);
    expect(container.querySelector(".text-live")).toBeNull();
    rerender(<StatusCell status={view("scheduled")} />);
    expect(container.querySelector(".text-live")).toBeNull();
  });
});

describe("ScoreNumber", () => {
  it("não acende na primeira renderização", () => {
    const { container } = render(<ScoreNumber value={0} />);
    expect(container.querySelector(".score-flash")).toBeNull();
  });

  it("acende quando o número MUDA (um gol), e de novo a cada mudança", () => {
    const { container, rerender } = render(<ScoreNumber value={0} />);
    const first = container.firstElementChild;
    rerender(<ScoreNumber value={1} />);
    expect(container.querySelector(".score-flash")).not.toBeNull();
    expect(container.textContent).toBe("1");
    const afterGoal = container.firstElementChild;
    expect(afterGoal).not.toBe(first); // elemento novo: a animação CSS reinicia
    rerender(<ScoreNumber value={2} />);
    expect(container.firstElementChild).not.toBe(afterGoal);
  });

  it("re-renderizar com o mesmo valor não reinicia a animação", () => {
    const { container, rerender } = render(<ScoreNumber value={3} />);
    const el = container.firstElementChild;
    rerender(<ScoreNumber value={3} />);
    expect(container.firstElementChild).toBe(el);
  });
});

describe("Crest", () => {
  it("sem escudo, mostra as iniciais (e nada de imagem quebrada)", () => {
    const { container } = render(<Crest team={{ name: "Corinthians", abbr: "COR" }} />);
    expect(screen.getByText("COR")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("com escudo da ESPN, pede a versão redimensionada (dobro do tamanho) e deixa o alt vazio (decorativo)", () => {
    const { container } = render(<Crest team={{ name: "Corinthians", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/874.png" }} size={28} />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/874.png&w=56&h=56");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("prioridade carrega na hora (escudos da primeira tela não 'pulam')", () => {
    const { container } = render(<Crest team={{ name: "X", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/1.png" }} priority />);
    expect(container.querySelector("img")).toHaveAttribute("loading", "eager");
  });

  it("se a imagem falhar, cai nas iniciais", () => {
    const { container } = render(<Crest team={{ name: "Corinthians", abbr: "COR", logo: "https://a.espncdn.com/i/teamlogos/soccer/500/874.png" }} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("COR")).toBeInTheDocument();
  });
});

describe("FavoriteButton", () => {
  it("o nome diz o que o clique faz e aria-pressed diz o estado", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<FavoriteButton pressed={false} onToggle={onToggle} name="Flamengo" />);
    const btn = screen.getByRole("button", { name: "Favoritar Flamengo" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
    rerender(<FavoriteButton pressed onToggle={onToggle} name="Flamengo" />);
    expect(screen.getByRole("button", { name: "Remover Flamengo dos favoritos" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("DayStrip", () => {
  it("mostra os dias ao redor da data, marca o escolhido e chama 'hoje' de hoje", () => {
    render(<DayStrip selected="2026-10-24" today="2026-10-22" onSelect={() => {}} />);
    const selected = screen.getByRole("button", { name: "sábado, 24 de outubro" });
    expect(selected).toHaveAttribute("aria-current", "date");
    expect(screen.getByRole("button", { name: "quinta-feira, 22 de outubro (hoje)" })).toHaveTextContent("hoje");
    expect(screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("clicar num dia avisa qual", () => {
    const onSelect = vi.fn();
    render(<DayStrip selected="2026-10-24" today="2026-10-22" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "sexta-feira, 23 de outubro" }));
    expect(onSelect).toHaveBeenCalledWith("2026-10-23");
  });

  it("calendário nativo: limitado à janela que a API aceita", () => {
    render(<DayStrip selected="2026-10-24" today="2026-10-22" onSelect={() => {}} />);
    const input = screen.getByLabelText("Data") as HTMLInputElement;
    expect(input.min).toBe("2026-08-23"); // hoje − 60 dias
    expect(input.max).toBe("2027-02-19"); // hoje + 120 dias
    expect(input.value).toBe("2026-10-24");
  });

  it("escolher no calendário avisa a data", () => {
    const onSelect = vi.fn();
    render(<DayStrip selected="2026-10-24" today="2026-10-22" onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-11-02" } });
    expect(onSelect).toHaveBeenCalledWith("2026-11-02");
  });

  it("esvaziar o campo de data (apagar) não dispara seleção vazia", () => {
    const onSelect = vi.fn();
    render(<DayStrip selected="2026-10-24" today="2026-10-22" onSelect={onSelect} />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "" } });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("Tabs", () => {
  const tabs = [
    { id: "a", label: "Resumo" },
    { id: "b", label: "Escalações" },
    { id: "c", label: "Estatísticas" },
  ];

  it("papéis e estado ARIA; só a aba ativa entra na ordem do Tab", () => {
    render(<Tabs tabs={tabs} value="b" onChange={() => {}} label="Detalhes" idPrefix="t" />);
    expect(screen.getByRole("tablist", { name: "Detalhes" })).toBeInTheDocument();
    const t = screen.getAllByRole("tab");
    expect(t.map((x) => x.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(t.map((x) => x.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    expect(t[1]).toHaveAttribute("aria-controls", "t-panel-b");
    expect(t[1]).toHaveAttribute("id", "t-tab-b");
  });

  it("setas movem a seleção (com volta ao início/fim) e Home/End vão às pontas", () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} value="a" onChange={onChange} label="Detalhes" idPrefix="t" />);
    const [first, , last] = screen.getAllByRole("tab");
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("b");
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("c"); // dá a volta
    fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("a");
    fireEvent.keyDown(first, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("c");
    fireEvent.keyDown(last, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("a");
  });

  it("outras teclas não fazem nada; clique troca de aba", () => {
    const onChange = vi.fn();
    render(<Tabs tabs={tabs} value="a" onChange={onChange} label="Detalhes" idPrefix="t" />);
    fireEvent.keyDown(screen.getAllByRole("tab")[0], { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Estatísticas" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });
});

describe("StateMessage", () => {
  it("erro é anunciado na hora (alert); vazio é só status", () => {
    const { rerender } = render(<StateMessage tone="error" title="Não foi possível carregar" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar");
    rerender(<StateMessage title="Nenhum jogo neste dia" />);
    expect(screen.getByRole("status")).toHaveTextContent("Nenhum jogo neste dia");
  });

  it("ação como botão ou como link", () => {
    const onClick = vi.fn();
    const { rerender } = render(<StateMessage title="x" action={{ label: "Tentar de novo", onClick }} />);
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<StateMessage title="x" action={{ label: "Ver os jogos", href: "/" }} />);
    expect(screen.getByRole("link", { name: "Ver os jogos" })).toHaveAttribute("href", "/");
  });
});

describe("tabela de classificação", () => {
  const row = (position: number, name: string, over: Partial<StandingRow> = {}): StandingRow => ({
    position,
    team: team(name),
    played: 31,
    won: 20,
    drawn: 7,
    lost: 4,
    goalsFor: 61,
    goalsAgainst: 25,
    goalDifference: 36,
    points: 67,
    form: null,
    zone: null,
    ...over,
  });
  const group: StandingsGroup = {
    name: null,
    rows: [
      row(1, "flamengo", { zone: { key: "libertadores", label: "Libertadores (fase de grupos)", tone: "qualification" } }),
      row(2, "palmeiras", { goalDifference: -4, points: 66, zone: { key: "libertadores", label: "Libertadores (fase de grupos)", tone: "qualification" } }),
      row(20, "remo", { goalDifference: 0, points: 12, zone: { key: "relegation", label: "Rebaixamento", tone: "relegation" } }),
    ],
  };

  it("é uma tabela de verdade: legenda, cabeçalhos com escopo e uma linha por time", () => {
    render(<StandingsTable group={group} caption="Classificação: Brasileirão" isFavorite={() => false} />);
    expect(screen.getByRole("table", { name: "Classificação: Brasileirão" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
    expect(screen.getAllByRole("row")).toHaveLength(4); // cabeçalho + 3 times
  });

  it("a zona é dita também em texto (a cor sozinha não basta para leitor de tela)", () => {
    render(<StandingsTable group={group} caption="x" isFavorite={() => false} />);
    expect(screen.getAllByText(/Libertadores \(fase de grupos\)/, { selector: ".sr-only" })).toHaveLength(2); // 1º e 2º colocados
    expect(screen.getAllByText(/Rebaixamento/, { selector: ".sr-only" })).toHaveLength(1);
  });

  it("cada time leva à sua página; saldo com sinal; pontos em destaque", () => {
    render(<StandingsTable group={group} caption="x" isFavorite={() => false} />);
    expect(screen.getByRole("link", { name: /Flamengo/ })).toHaveAttribute("href", "/time/espn:flamengo");
    expect(screen.getByText("+36")).toBeInTheDocument();
    expect(screen.getByText("−4")).toBeInTheDocument();
    expect(screen.getByText("67")).toHaveClass("font-bold");
  });

  it("V, E e D só em telas maiores (escondidos no celular)", () => {
    render(<StandingsTable group={group} caption="x" isFavorite={() => false} />);
    for (const name of ["Vitórias", "Empates", "Derrotas"]) expect(screen.getByText(name[0], { selector: "abbr" }).closest("th")).toHaveClass("hidden");
  });

  it("sinal do saldo de gols", () => {
    expect([signed(5), signed(0), signed(-3)]).toEqual(["+5", "0", "−3"]);
  });

  it("legenda lista cada vaga uma vez, e some quando não há zonas", () => {
    const { container, rerender } = render(<ZoneLegend groups={[group]} />);
    expect(within(container).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Libertadores (fase de grupos)", "Rebaixamento"]);
    rerender(<ZoneLegend groups={[{ name: null, rows: [row(1, "x")] }]} />);
    expect(container.querySelector("ul")).toBeNull();
  });
});

describe("linha do tempo do jogo", () => {
  const ev = (id: string, type: MatchEvent["type"], side: MatchEvent["side"], clock: string | null, over: Partial<MatchEvent> = {}): MatchEvent => ({
    id,
    type,
    minute: clock ? Number.parseInt(clock, 10) : null,
    clock,
    side,
    player: null,
    secondaryPlayer: null,
    text: null,
    score: null,
    ...over,
  });
  const events: MatchEvent[] = [
    ev("1", "kickoff", null, null),
    ev("2", "goal", "away", "45'+1'", { player: "Renê", score: { home: 0, away: 1 } }),
    ev("3", "halftime", null, "45'+3'"),
    ev("4", "yellow_card", "away", "53'", { player: "Renê" }),
    ev("5", "penalty_goal", "home", "66'", { player: "Yuri Alberto", score: { home: 1, away: 1 } }),
    ev("6", "substitution", "home", "67'", { player: "Vitinho", secondaryPlayer: "Kaio" }),
    ev("7", "fulltime", null, "90'+13'"),
  ];

  it("descreve cada lance em texto para leitor de tela, com o time e o placar corrido", () => {
    const { container } = render(<Timeline events={events} live={false} homeName="Corinthians" awayName="Vitória" />);
    const spoken = [...container.querySelectorAll(".sr-only")].map((e) => e.textContent);
    expect(spoken).toContain("Vitória: Gol de Renê, 0 a 1.");
    expect(spoken).toContain("Corinthians: Gol de Yuri Alberto (pênalti), 1 a 1.");
    expect(spoken).toContain("Vitória: Cartão amarelo para Renê.");
    expect(spoken).toContain("Corinthians: Substituição: entra Kaio, sai Vitinho.");
  });

  it("início, intervalo e fim viram divisórias", () => {
    render(<Timeline events={events} live={false} homeName="A" awayName="B" />);
    expect(screen.getByText("Início do jogo")).toBeInTheDocument();
    expect(screen.getByText("Intervalo")).toBeInTheDocument();
    expect(screen.getByText("Fim do jogo")).toBeInTheDocument();
  });

  it("depois do jogo: ordem cronológica; ao vivo: o lance mais novo primeiro", () => {
    const order = (live: boolean) => {
      const { container, unmount } = render(<Timeline events={events} live={live} homeName="A" awayName="B" />);
      const ids = [...container.querySelectorAll("li")].map((li) => li.textContent ?? "");
      unmount();
      return ids;
    };
    const finished = order(false);
    const live = order(true);
    expect(finished[0]).toContain("Início do jogo");
    expect(finished.at(-1)).toContain("Fim do jogo");
    expect(live[0]).toContain("Fim do jogo");
    expect(live.at(-1)).toContain("Início do jogo");
  });

  it("gol mostra o placar corrido; pênalti aparece como observação", () => {
    render(<Timeline events={events} live={false} homeName="A" awayName="B" />);
    expect(screen.getByText("1 – 1", { exact: false, selector: "p" })).toHaveTextContent("pênalti");
  });
});

describe("estatísticas do jogo", () => {
  const stat = (over: Partial<StatLine> = {}): StatLine => ({ key: "k", label: "Finalizações", home: 21, away: 5, homeText: "21", awayText: "5", ...over });

  it("proporção do mandante", () => {
    expect(homeShare(stat())).toBeCloseTo(80.77, 1);
    expect(homeShare(stat({ home: 0, away: 0 }))).toBe(50);
    expect(homeShare(stat({ home: null, away: 4 }))).toBe(0);
    expect(homeShare(stat({ home: 3, away: null }))).toBe(100);
  });

  it("o lado que lidera fica em destaque; o outro, apagado", () => {
    render(<MatchStats stats={[stat()]} />);
    expect(screen.getByText("21")).toHaveClass("font-bold");
    expect(screen.getByText("5")).toHaveClass("text-muted");
    expect(screen.getByText("Finalizações")).toBeInTheDocument();
  });

  it("empate: ninguém em destaque; valor ausente aparece como traço", () => {
    render(<MatchStats stats={[stat({ home: 4, away: 4, homeText: "4", awayText: null })]} />);
    expect(screen.getByText("4")).not.toHaveClass("font-bold");
    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("a lista é semântica (dl/dt/dd)", () => {
    const { container } = render(<MatchStats stats={[stat(), stat({ key: "k2", label: "Escanteios" })]} />);
    expect(container.querySelectorAll("dt")).toHaveLength(2);
    expect(container.querySelectorAll("dd")).toHaveLength(4);
  });
});

describe("escalação", () => {
  const lineup: Lineup = {
    side: "home",
    formation: "4-2-3-1",
    coach: "Dorival Júnior",
    starters: [
      { name: "Hugo Souza", shirtNumber: 1, position: "G", captain: false },
      { name: "Gustavo Henrique", shirtNumber: 13, position: "ZAG", captain: false },
    ],
    bench: [
      { name: "Matheus Donelli", shirtNumber: 12, position: "G", captain: false },
      { name: "Sem Número", shirtNumber: null, position: null, captain: false },
    ],
  };

  it("mostra time (com link), formação, técnico e titulares com camisa e posição", () => {
    render(<LineupBlock lineup={lineup} team={team("corinthians")} />);
    expect(screen.getByRole("link", { name: "Corinthians" })).toHaveAttribute("href", "/time/espn:corinthians");
    expect(screen.getByText("4-2-3-1")).toBeInTheDocument();
    expect(screen.getByText("Técnico: Dorival Júnior")).toBeInTheDocument();
    const starters = screen.getByRole("list", { name: "Titulares de Corinthians" });
    expect(within(starters).getAllByRole("listitem")).toHaveLength(2);
    expect(within(starters).getByText("13")).toBeInTheDocument();
    expect(within(starters).getByText("ZAG")).toBeInTheDocument();
  });

  it("reservas ficam recolhidos, com a contagem", () => {
    const { container } = render(<LineupBlock lineup={lineup} team={team("corinthians")} />);
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("Reservas (2)")).toBeInTheDocument();
  });

  it("sem reservas nem técnico, esses blocos não aparecem", () => {
    const { container } = render(<LineupBlock lineup={{ ...lineup, coach: null, bench: [], formation: null }} team={team("corinthians")} />);
    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByText(/Técnico/)).toBeNull();
  });
});
