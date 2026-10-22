import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/matches.json";
import { convertMatches } from "./pandascore";
import type { EsportsMatch, EsportsStatus, EsportsTier } from "./types";
import { esportsSummary, groupEsports, hasLiveEsports, isMainTier, parseGameTab, showsStreams, streamLabel } from "./ui";

const all = convertMatches(fixture as unknown[]);
const get = (id: number) => all.find((m) => m.id === `pandascore:${id}`)!;

const mk = (over: Partial<EsportsMatch> & { id: string }): EsportsMatch => ({
  game: "cs2",
  status: "scheduled",
  scheduledAt: "2026-10-22T18:00:00Z",
  bestOf: 3,
  forfeit: false,
  league: "Liga X",
  serie: null,
  tournament: null,
  tier: "A",
  home: { team: { id: "pandascore:1", name: "Um", acronym: null, logo: null }, score: null, winner: false },
  away: { team: { id: "pandascore:2", name: "Dois", acronym: null, logo: null }, score: null, winner: false },
  streams: [],
  ...over,
});

describe("parseGameTab", () => {
  it("aceita só jogos conhecidos; o resto vira 'todos'", () => {
    expect(["cs2", "lol", "valorant"].map(parseGameTab)).toEqual(["cs2", "lol", "valorant"]);
    for (const v of [null, undefined, "", "todos", "dota", "CS2", "cs2,lol", "__proto__"]) expect(parseGameTab(v)).toBe("todos");
  });
});

describe("isMainTier", () => {
  it("S, A e B são principais; C, D e sem tier não", () => {
    const tiers: EsportsTier[] = ["S", "A", "B", "C", "D", "unranked"];
    expect(tiers.map(isMainTier)).toEqual([true, true, true, false, false, false]);
  });
});

describe("groupEsports", () => {
  it("agrupa por campeonato e etapa; o mais importante (tier) primeiro", () => {
    const groups = groupEsports(all);
    // A partida 1006 não tem etapa (`serie`), então fica num grupo próprio, separado da 1003.
    expect(groups.map((g) => g.league)).toEqual(["Liga Aurora", "Liga Boreal", "Copa Cobalto", "Copa Cobalto", "Open Menor", "Liga Teste"]);
    expect(groups.map((g) => g.tier)).toEqual(["S", "A", "B", "C", "D", "unranked"]);
  });

  it("em empate de tier, quem começa mais cedo vem antes", () => {
    const late = mk({ id: "pandascore:1", league: "Tarde", scheduledAt: "2026-10-22T22:00:00Z" });
    const early = mk({ id: "pandascore:2", league: "Cedo", scheduledAt: "2026-10-22T12:00:00Z" });
    expect(groupEsports([late, early]).map((g) => g.league)).toEqual(["Cedo", "Tarde"]);
  });

  it("o grupo vale pelo MELHOR tier das suas partidas; dentro dele, por horário", () => {
    const g = groupEsports([
      mk({ id: "pandascore:1", tier: "C", scheduledAt: "2026-10-22T20:00:00Z" }),
      mk({ id: "pandascore:2", tier: "S", scheduledAt: "2026-10-22T21:00:00Z" }),
      mk({ id: "pandascore:3", tier: "D", scheduledAt: "2026-10-22T10:00:00Z" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].tier).toBe("S");
    expect(g[0].matches.map((m) => m.id)).toEqual(["pandascore:3", "pandascore:1", "pandascore:2"]);
  });

  it("'só principais' tira C, D e sem tier — e grupos que ficam vazios somem", () => {
    const groups = groupEsports(all, { mainOnly: true });
    expect(groups.map((g) => g.league)).toEqual(["Liga Aurora", "Liga Boreal", "Copa Cobalto"]);
    expect(groups.flatMap((g) => g.matches).map((m) => m.id)).toEqual(["pandascore:1001", "pandascore:1002", "pandascore:1003"]);
  });

  it("mesma liga em etapas diferentes vira dois grupos", () => {
    const groups = groupEsports([mk({ id: "pandascore:1", serie: "Spring" }), mk({ id: "pandascore:2", serie: "Summer", scheduledAt: "2026-10-22T19:00:00Z" })]);
    expect(groups.map((g) => g.serie)).toEqual(["Spring", "Summer"]);
  });

  it("lista vazia → nenhum grupo", () => {
    expect(groupEsports([])).toEqual([]);
  });
});

describe("hasLiveEsports", () => {
  it("só 'live' conta", () => {
    expect(hasLiveEsports(all)).toBe(true);
    expect(hasLiveEsports(all.filter((m) => m.status !== "live"))).toBe(false);
  });
});

describe("streamLabel", () => {
  it("reconhece as plataformas e cai no domínio", () => {
    const l = (url: string) => streamLabel({ url });
    expect(l("https://www.twitch.tv/canal")).toBe("Twitch");
    expect(l("https://m.twitch.tv/canal")).toBe("Twitch");
    expect(l("https://www.youtube.com/watch?v=1")).toBe("YouTube");
    expect(l("https://youtu.be/abc")).toBe("YouTube");
    expect(l("https://kick.com/x")).toBe("Kick");
    expect(l("https://www.exemplo-tv.com.br/ao-vivo")).toBe("exemplo-tv.com.br");
    expect(l("não é url")).toBe("Transmissão");
  });

  it("domínio parecido não é confundido (twitch.tv.evil.com)", () => {
    expect(streamLabel({ url: "https://twitch.tv.evil.com/x" })).toBe("twitch.tv.evil.com");
    expect(streamLabel({ url: "https://notyoutube.com/x" })).toBe("notyoutube.com");
  });
});

describe("showsStreams", () => {
  it("antes e durante; depois de encerrar (ou se adiada/cancelada), não", () => {
    const s: EsportsStatus[] = ["scheduled", "live", "finished", "postponed", "canceled"];
    expect(s.map((status) => showsStreams({ status }))).toEqual([true, true, false, false, false]);
  });
});

describe("esportsSummary (rótulo falado)", () => {
  it("encerrada com placar e formato", () => {
    expect(esportsSummary(get(1001))).toBe("Alpha Esports 2, Bravo Gaming 1, encerrada, melhor de 3");
  });
  it("em andamento", () => {
    expect(esportsSummary(get(1002))).toBe("Charlie 1, Delta Team 2, em andamento, melhor de 5");
  });
  it("agendada com adversário a definir: sem placar", () => {
    expect(esportsSummary(get(1003))).toBe("Echo Club contra a definir, agendada, melhor de 3");
  });
  it("W.O., adiada e cancelada", () => {
    expect(esportsSummary(get(1006))).toContain("encerrada por W.O.");
    expect(esportsSummary(get(1004))).toContain("Foxtrot contra Golf, adiada");
    expect(esportsSummary(get(1005))).toContain("cancelada");
  });
  it("sem formato de melhor de N, não cita", () => {
    expect(esportsSummary(get(1009))).not.toContain("melhor de");
  });
});
