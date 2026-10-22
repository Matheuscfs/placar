// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BROADCASTS, BROADCASTS_CHECKED_AT, broadcastFor } from "@/lib/domain/broadcasts";
import { isLeagueId } from "@/lib/domain/leagues";
import type { LeagueId, MatchDetail, MatchStatus } from "@/lib/domain/types";
import { Facts } from "./match-view";

afterEach(cleanup);

const team = (key: string) => ({ id: `espn:${key}`, key, name: key, shortName: key, abbr: key.slice(0, 3).toUpperCase() });
const detail = (leagueId: LeagueId, status: MatchStatus, over: Partial<MatchDetail> = {}): MatchDetail => ({
  id: "espn:x:1",
  source: "espn",
  leagueId,
  season: "2026",
  round: null,
  kickoff: "2026-10-24T19:30:00Z",
  status,
  statusText: null,
  clock: null,
  home: { team: team("a"), score: null, penalties: null, aggregate: null },
  away: { team: team("b"), score: null, penalties: null, aggregate: null },
  venue: null,
  referee: null,
  attendance: null,
  events: [],
  lineups: [],
  statistics: [],
  ...over,
});

describe("catálogo de 'onde passa'", () => {
  it("só tem ligas que existem, com canais não vazios e sem repetição", () => {
    for (const [id, info] of Object.entries(BROADCASTS)) {
      expect(isLeagueId(id), id).toBe(true);
      expect(info.channels.length, id).toBeGreaterThan(0);
      expect(new Set(info.channels).size, id).toBe(info.channels.length);
      expect(info.channels.every((c) => c.trim() === c && c !== ""), id).toBe(true);
    }
  });

  it("a data da conferência é uma data de calendário válida", () => {
    expect(BROADCASTS_CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("competição sem informação confiável devolve null (não inventamos)", () => {
    expect(broadcastFor("bundesliga")).toBeNull();
    expect(broadcastFor("champions-league")).toBeNull();
    expect(broadcastFor("libertadores")?.channels).toContain("ESPN");
  });

  it("toda ressalva diz que o canal exato deve ser confirmado, quando os direitos são divididos", () => {
    for (const id of ["brasileirao-a", "brasileirao-b", "copa-do-brasil", "libertadores", "sul-americana"] as const) {
      expect(broadcastFor(id)?.note, id).toMatch(/confirme/i);
    }
  });
});

describe("Facts — onde passa", () => {
  it("jogo agendado: mostra os canais como 'costuma passar', nunca como certeza", () => {
    render(<Facts m={detail("libertadores", "scheduled")} />);
    expect(screen.getByRole("heading", { name: "Onde passa" })).toBeInTheDocument();
    expect(screen.getByText(/costuma passar em/i)).toBeInTheDocument();
    expect(screen.getByText(/ESPN, Disney\+, TV Globo, Paramount\+/)).toBeInTheDocument();
    expect(screen.getByText(/confirme o do seu jogo/i)).toBeInTheDocument();
  });

  it("ao vivo e intervalo também mostram", () => {
    for (const status of ["live", "halftime"] as const) {
      render(<Facts m={detail("brasileirao-a", status)} />);
      expect(screen.getByRole("heading", { name: "Onde passa" })).toBeInTheDocument();
      cleanup();
    }
  });

  it("encerrado, adiado, suspenso e cancelado não mostram (não há o que assistir)", () => {
    for (const status of ["finished", "postponed", "suspended", "canceled"] as const) {
      const { container } = render(<Facts m={detail("brasileirao-a", status)} />);
      expect(container, status).toBeEmptyDOMElement();
      cleanup();
    }
  });

  it("liga sem catálogo e sem outros fatos: não renderiza nada", () => {
    const { container } = render(<Facts m={detail("bundesliga", "scheduled")} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("convive com local, árbitro e público", () => {
    render(<Facts m={detail("copa-do-brasil", "scheduled", { venue: "Maracanã", referee: "Fulano", attendance: 52000 })} />);
    expect(screen.getByText("Maracanã")).toBeInTheDocument();
    expect(screen.getByText("52.000")).toBeInTheDocument();
    expect(screen.getByText(/TV Globo, SporTV, Premiere, Prime Video/)).toBeInTheDocument();
  });

  it("sem catálogo mas com local: mostra só o local", () => {
    render(<Facts m={detail("bundesliga", "scheduled", { venue: "Allianz Arena" })} />);
    expect(screen.getByText("Allianz Arena")).toBeInTheDocument();
    expect(screen.queryByText("Onde passa")).not.toBeInTheDocument();
  });
});
