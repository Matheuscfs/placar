import { describe, expect, it } from "vitest";
import search from "./__fixtures__/search-real.json";
import { teamHitsFromSearch } from "./convert";
import type { EspnSearchItem } from "./espn-types";

const items = search.items as EspnSearchItem[];

describe("busca de times (resposta real da ESPN para \"real\")", () => {
  const hits = teamHitsFromSearch(items);

  it("fica só com futebol: hóquei e futebol canadense/americano somem", () => {
    const names = hits.map((h) => h.team.name);
    expect(names).not.toContain("Montreal Canadiens");
    expect(names).not.toContain("Montreal Alouettes");
  });

  it("descarta times de base (U17, U19, U20)", () => {
    expect(hits.some((h) => /\b[US]\d{2}\b/i.test(h.team.name))).toBe(false);
    expect(hits.map((h) => h.team.name)).not.toContain("Real Madrid U19");
  });

  it("põe primeiro os times de campeonatos do catálogo, com o nome do campeonato", () => {
    const first = hits[0];
    expect(first.team.id).toBe("espn:86");
    expect(first.team.name).toBe("Real Madrid");
    expect(first.leagueName).not.toBeNull();
    const firstOther = hits.findIndex((h) => h.leagueName === null);
    expect(hits.slice(firstOther).every((h) => h.leagueName === null)).toBe(true);
  });

  it("devolve no máximo 12 e sem repetir o mesmo time", () => {
    expect(hits.length).toBeLessThanOrEqual(12);
    expect(new Set(hits.map((h) => h.team.id)).size).toBe(hits.length);
    expect(teamHitsFromSearch([...items, ...items]).length).toBe(hits.length);
  });

  it("cada resultado tem id qualificado (abre a página do time), chave e escudo", () => {
    for (const h of hits) {
      expect(h.team.id).toMatch(/^espn:\d+$/);
      expect(h.team.key).not.toBe("");
    }
    expect(hits[0].team.logo).toMatch(/^https:\/\//);
  });

  it("resposta vazia, sem itens ou malformada não quebra", () => {
    expect(teamHitsFromSearch(undefined)).toEqual([]);
    expect(teamHitsFromSearch([])).toEqual([]);
    expect(teamHitsFromSearch([{ sport: "soccer" }, { sport: "soccer", id: "1" }])).toEqual([]);
  });
});
