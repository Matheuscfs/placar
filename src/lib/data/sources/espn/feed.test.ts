import { describe, expect, it } from "vitest";
import { getLeagueDef, LEAGUES } from "@/lib/domain/leagues";
import feedDay from "./__fixtures__/feed-2026-10-24.json";
import feedLive from "./__fixtures__/feed-live.json";
import { espnLeagueIdOf, eventsFromDetails, matchesFromAllFeed, toMatch, toStatus } from "./convert";
import type { EspnEvent, EspnScoreboard } from "./espn-types";

const events = (b: unknown) => (b as EspnScoreboard).events ?? [];
const live = events(feedLive).filter((e) => e.status?.type?.state === "in");
const brasileirao = getLeagueDef("brasileirao-a");

describe("id da liga no feed global", () => {
  it("sai do `uid` do evento", () => {
    expect(espnLeagueIdOf({ uid: "s:600~l:630~e:401841272" })).toBe("630");
    expect(espnLeagueIdOf({ uid: "s:600~l:20296~e:401915846" })).toBe("20296");
    expect(espnLeagueIdOf({ uid: "sem-liga" })).toBeNull();
    expect(espnLeagueIdOf({})).toBeNull();
  });

  it("cada liga do catálogo tem um id numérico próprio, sem repetição", () => {
    const ids = LEAGUES.map((l) => l.sources.espnLeagueId);
    expect(ids.every((id) => /^\d+$/.test(id ?? ""))).toBe(true);
    expect(new Set(ids).size).toBe(LEAGUES.length);
  });
});

describe("matchesFromAllFeed (feed real de 24/10/2026)", () => {
  it("reconhece cada liga do catálogo pelo id e ignora as outras", () => {
    // O catálogo cresce, então não dependemos de quais ligas a ESPN tinha naquele dia: juntamos um jogo de uma liga
    // que NÃO está no catálogo (id 99999) e conferimos que só ele fica de fora.
    const stranger = { ...events(feedDay)[0], id: "999999", uid: "s:600~l:99999~e:999999" };
    const board = { ...(feedDay as object), events: [...events(feedDay), stranger] } as unknown as EspnScoreboard;
    const ms = matchesFromAllFeed(board, [...LEAGUES]);
    const doCatalogo = events(feedDay).filter((e) => LEAGUES.some((l) => l.sources.espnLeagueId === espnLeagueIdOf(e)));
    expect(ms).toHaveLength(doCatalogo.length);
    expect(events(board).length).toBeGreaterThan(ms.length); // o feed tem jogos de ligas que não são nossas
    const ids = new Set(ms.map((m) => m.leagueId));
    expect(ids.has("brasileirao-a")).toBe(true);
    expect([...ids].every((id) => LEAGUES.some((l) => l.id === id))).toBe(true);
  });

  it("só devolve as ligas pedidas", () => {
    const ms = matchesFromAllFeed(feedDay as unknown as EspnScoreboard, [brasileirao]);
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => m.leagueId === "brasileirao-a" && /^espn:bra\.1:\d+$/.test(m.id))).toBe(true);
  });

  it("evento sem uid, ou de liga desconhecida, é ignorado", () => {
    const base = events(feedDay).find((e) => espnLeagueIdOf(e) === "630")!;
    const board: EspnScoreboard = { events: [{ ...base, uid: undefined }, { ...base, uid: "s:600~l:99999~e:1" }, base] };
    expect(matchesFromAllFeed(board, [brasileirao])).toHaveLength(1);
    expect(matchesFromAllFeed(undefined, [brasileirao])).toEqual([]);
  });
});

/**
 * Valores OBSERVADOS na ESPN em 22/10/2026, em jogos de verdade em andamento — antes disso o
 * mapeamento de jogo ao vivo só tinha sido inferido (só havia histórico de jogos encerrados).
 */
describe("status ao vivo (observado na ESPN)", () => {
  it("2º tempo: STATUS_SECOND_HALF, relógio '73\''", () => {
    expect(toStatus({ clock: 4380, displayClock: "73'", period: 2, type: { name: "STATUS_SECOND_HALF", state: "in", detail: "73'", shortDetail: "73'" } })).toMatchObject({
      status: "live",
      statusText: "2º tempo",
      clock: "73'",
    });
  });

  it("a ESPN às vezes troca o nome para STATUS_IN_PROGRESS no mesmo jogo: o período decide o texto", () => {
    expect(toStatus({ clock: 3540, displayClock: "59'", period: 2, type: { name: "STATUS_IN_PROGRESS", state: "in" } })).toMatchObject({ status: "live", statusText: "2º tempo", clock: "59'" });
    expect(toStatus({ clock: 600, displayClock: "10'", period: 1, type: { name: "STATUS_IN_PROGRESS", state: "in" } })).toMatchObject({ statusText: "1º tempo", clock: "10'" });
  });

  it("intervalo: STATUS_HALFTIME traz o relógio '45'+4'' mas não é exibido", () => {
    expect(toStatus({ clock: 2700, displayClock: "45'+4'", period: 1, type: { name: "STATUS_HALFTIME", state: "in", detail: "HT", shortDetail: "HT" } })).toMatchObject({
      status: "halftime",
      statusText: "Intervalo",
      clock: null,
    });
  });
});

describe("jogos em andamento reais (capturados em 22/10/2026)", () => {
  it("a fixture tem jogos de verdade em andamento", () => {
    expect(live.length).toBeGreaterThan(0);
  });

  it("todos viram `live` ou `halftime`, com placar numérico e relógio no formato certo", () => {
    for (const e of live) {
      const m = toMatch(e, "brasileirao-a", "bra.1")!;
      expect(m, e.shortName).not.toBeNull();
      expect(["live", "halftime"]).toContain(m.status);
      expect(typeof m.home.score).toBe("number");
      expect(typeof m.away.score).toBe("number");
      expect(m.home.penalties).toBeNull(); // ainda no 2º tempo: sem pênaltis
      if (m.status === "live") {
        expect(m.clock).toMatch(/^\d+'/);
        expect(m.statusText).toMatch(/tempo|Prorrogação/);
      }
    }
  });

  it("o placar de cada jogo bate com a soma dos gols da linha do tempo (details ao vivo)", () => {
    let comGols = 0;
    for (const e of live) {
      const comp = e.competitions![0];
      const m = toMatch(e, "brasileirao-a", "bra.1")!;
      const homeId = comp.competitors!.find((c) => c.homeAway === "home")!.team!.id!;
      const awayId = comp.competitors!.find((c) => c.homeAway === "away")!.team!.id!;
      const goals = eventsFromDetails(comp.details, homeId, awayId).filter((x) => x.score);
      if (goals.length === 0) continue;
      comGols++;
      const last = goals.at(-1)!.score!;
      expect([last.home, last.away], e.shortName).toEqual([m.home.score, m.away.score]);
    }
    expect(comGols).toBeGreaterThan(0);
  });

  it("cartões e gols ao vivo viram eventos tipados, em ordem", () => {
    const e = live.find((x) => (x.competitions![0].details ?? []).length >= 4) as EspnEvent;
    const comp = e.competitions![0];
    const evs = eventsFromDetails(comp.details, comp.competitors![0].team!.id!, comp.competitors![1].team!.id!);
    expect(evs.length).toBeGreaterThanOrEqual(4);
    expect(evs.every((x) => ["goal", "penalty_goal", "own_goal", "yellow_card", "red_card", "second_yellow", "missed_penalty", "other"].includes(x.type))).toBe(true);
    const minutes = evs.map((x) => x.minute).filter((x): x is number => x !== null);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });
});
