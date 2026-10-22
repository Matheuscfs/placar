import { describe, expect, it } from "vitest";
import type { LeagueId, Match, MatchStatus } from "@/lib/domain/types";
import { EMPTY_FAVORITES, type Favorites } from "./favorites";
import { filterMatches, isLiveMatch, matchesQuery, normalizeText } from "./filters";

const team = (key: string, name: string, abbr: string) => ({ id: `espn:${key}`, key, name, shortName: name, abbr });

function game(over: { id?: string; league?: LeagueId; status?: MatchStatus; home?: [string, string, string]; away?: [string, string, string]; round?: string | null } = {}): Match {
  const [hk, hn, ha] = over.home ?? ["flamengo", "Flamengo", "FLA"];
  const [ak, an, aa] = over.away ?? ["estudiantes", "Estudiantes de La Plata", "EST"];
  return {
    id: over.id ?? "espn:x:1",
    source: "espn",
    leagueId: over.league ?? "libertadores",
    season: "2026",
    round: over.round ?? null,
    kickoff: "2026-10-22T22:00:00Z",
    status: over.status ?? "scheduled",
    statusText: null,
    clock: null,
    home: { team: team(hk, hn, ha), score: null, penalties: null, aggregate: null },
    away: { team: team(ak, an, aa), score: null, penalties: null, aggregate: null },
    venue: null,
  };
}

describe("normalizeText", () => {
  it("tira acento, caixa e espaços das pontas", () => {
    expect(normalizeText("  Grêmio ")).toBe("gremio");
    expect(normalizeText("São Paulo")).toBe("sao paulo");
    expect(normalizeText("ATLÉTICO-MG")).toBe("atletico-mg");
    expect(normalizeText("")).toBe("");
  });
});

describe("matchesQuery", () => {
  const fla = game({ round: "Oitavas de final" });

  it("busca vazia combina com tudo", () => {
    expect(matchesQuery(fla, "")).toBe(true);
    expect(matchesQuery(fla, "   ")).toBe(true);
  });

  it("acha por nome, parte do nome e sigla de qualquer um dos times, sem ligar para acento ou caixa", () => {
    for (const q of ["flamengo", "FLAM", "fla", "estudiantes", "la plata", "EST"]) expect(matchesQuery(fla, q), q).toBe(true);
    expect(matchesQuery(game({ home: ["gremio", "Grêmio", "GRE"] }), "gremio")).toBe(true);
    expect(matchesQuery(game({ home: ["gremio", "Grêmio", "GRE"] }), "GRÊMIO")).toBe(true);
  });

  it("acha pelo campeonato (nome, nome curto e país) e pela fase", () => {
    expect(matchesQuery(fla, "libertadores")).toBe(true);
    expect(matchesQuery(fla, "conmebol")).toBe(true);
    expect(matchesQuery(fla, "america do sul")).toBe(true);
    expect(matchesQuery(fla, "oitavas")).toBe(true);
    expect(matchesQuery(game({ league: "brasileirao-a" }), "brasil")).toBe(true);
  });

  it("várias palavras: todas precisam aparecer, em qualquer ordem", () => {
    expect(matchesQuery(fla, "fla liberta")).toBe(true);
    expect(matchesQuery(fla, "liberta fla")).toBe(true);
    expect(matchesQuery(fla, "fla palmeiras")).toBe(false);
  });

  it("não acha o que não está lá", () => {
    expect(matchesQuery(fla, "xyz")).toBe(false);
    expect(matchesQuery(fla, "premier")).toBe(false);
  });
});

describe("isLiveMatch", () => {
  it("ao vivo e intervalo contam; o resto não", () => {
    const s: MatchStatus[] = ["scheduled", "live", "halftime", "finished", "postponed", "suspended", "canceled"];
    expect(s.map((status) => isLiveMatch(game({ status })))).toEqual([false, true, true, false, false, false, false]);
  });
});

describe("filterMatches", () => {
  const live = game({ id: "a", status: "live" });
  const half = game({ id: "b", status: "halftime", home: ["palmeiras", "Palmeiras", "PAL"], away: ["santos", "Santos", "SAN"], league: "brasileirao-a" });
  const later = game({ id: "c", home: ["corinthians", "Corinthians", "COR"], away: ["vitoria", "Vitória", "VIT"], league: "brasileirao-a" });
  const all = [live, half, later];
  const favs: Favorites = { teams: [{ key: "corinthians", id: "espn:874", name: "Corinthians" }], leagues: [] };
  const ids = (ms: Match[]) => ms.map((m) => m.id);

  it("'todos' sem busca devolve tudo, na mesma ordem", () => {
    expect(ids(filterMatches(all, { status: "todos", query: "", favorites: EMPTY_FAVORITES }))).toEqual(["a", "b", "c"]);
  });

  it("'ao vivo' inclui o intervalo", () => {
    expect(ids(filterMatches(all, { status: "ao-vivo", query: "", favorites: EMPTY_FAVORITES }))).toEqual(["a", "b"]);
  });

  it("'favoritos' pega jogos em que um dos dois times é favorito (mandante ou visitante)", () => {
    expect(ids(filterMatches(all, { status: "favoritos", query: "", favorites: favs }))).toEqual(["c"]);
    const visitor: Favorites = { teams: [{ key: "vitoria", id: "espn:1", name: "Vitória" }], leagues: [] };
    expect(ids(filterMatches(all, { status: "favoritos", query: "", favorites: visitor }))).toEqual(["c"]);
    expect(filterMatches(all, { status: "favoritos", query: "", favorites: EMPTY_FAVORITES })).toEqual([]);
  });

  it("liga favorita sozinha NÃO faz jogo virar 'favorito' (só time)", () => {
    const f: Favorites = { teams: [], leagues: ["brasileirao-a"] };
    expect(filterMatches(all, { status: "favoritos", query: "", favorites: f })).toEqual([]);
  });

  it("filtro e busca se combinam", () => {
    expect(ids(filterMatches(all, { status: "ao-vivo", query: "palmeiras", favorites: EMPTY_FAVORITES }))).toEqual(["b"]);
    expect(filterMatches(all, { status: "ao-vivo", query: "corinthians", favorites: EMPTY_FAVORITES })).toEqual([]);
  });

  it("não altera a lista original", () => {
    const copy = [...all];
    filterMatches(all, { status: "ao-vivo", query: "", favorites: EMPTY_FAVORITES });
    expect(all).toEqual(copy);
  });
});
