import { describe, expect, it } from "vitest";
import type { DataSource } from "./data-source";
import { AllSourcesFailedError, DataSourceError } from "./errors";
import { Orchestrator } from "./orchestrator";
import type { SourceId, TeamSearchHit } from "@/lib/domain/types";

const T0 = Date.parse("2026-10-22T15:00:00Z");
const hit = (id: string, name: string): TeamSearchHit => ({ team: { id: `espn:${id}`, key: name.toLowerCase(), name, shortName: name, abbr: name.slice(0, 3).toUpperCase() }, leagueName: null });

/** Fonte falsa: só a busca importa aqui; o resto não deve ser chamado. */
function source(id: SourceId, search?: (q: string) => Promise<TeamSearchHit[]>) {
  const calls: string[] = [];
  const src: DataSource = {
    id,
    capabilities: { live: true, events: true, lineups: true, statistics: true, standings: true, crests: true },
    supportsLeague: () => true,
    getLeagues: async () => [],
    getMatchesByDate: async () => [],
    getLiveMatches: async () => [],
    getMatch: async () => {
      throw new Error("não deveria ser chamado");
    },
    getStandings: async () => {
      throw new Error("não deveria ser chamado");
    },
    getTeam: async () => {
      throw new Error("não deveria ser chamado");
    },
    ...(search ? { searchTeams: async (q: string) => (calls.push(q), search(q)) } : {}),
  };
  return { src, calls };
}

const orchestrator = (...sources: Array<ReturnType<typeof source>>) => new Orchestrator({ sources: sources.map((s) => s.src), now: () => T0 });

describe("busca de times no orquestrador", () => {
  it("devolve os resultados da fonte com a proveniência", async () => {
    const espn = source("espn", async () => [hit("819", "Flamengo")]);
    const r = await orchestrator(espn).searchTeams("flamengo");
    expect(r.data.map((h) => h.team.name)).toEqual(["Flamengo"]);
    expect(r.meta).toMatchObject({ source: "espn", cache: "miss", fallback: false });
  });

  it("a mesma busca (maiúsculas e espaços à parte) gasta UMA chamada à fonte", async () => {
    const espn = source("espn", async () => [hit("819", "Flamengo")]);
    const orch = orchestrator(espn);
    await orch.searchTeams("flamengo");
    const again = await orch.searchTeams("  Flamengo ");
    expect(again.meta.cache).toBe("hit");
    expect(espn.calls).toEqual(["flamengo"]);
  });

  it("buscas diferentes têm chaves diferentes", async () => {
    const espn = source("espn", async () => []);
    const orch = orchestrator(espn);
    await orch.searchTeams("flamengo");
    await orch.searchTeams("fluminense");
    expect(espn.calls).toHaveLength(2);
  });

  it("pula fonte que não sabe buscar e cai para a seguinte quando a primeira falha", async () => {
    const semBusca = source("openfootball");
    const quebrada = source("espn", async () => {
      throw new DataSourceError("unavailable", "caiu", { source: "espn" });
    });
    const boa = source("football-data", async () => [hit("1", "Santos")]);
    const r = await orchestrator(semBusca, quebrada, boa).searchTeams("santos");
    expect(r.data[0].team.name).toBe("Santos");
    expect(r.meta).toMatchObject({ source: "football-data", fallback: true });
    expect(r.meta.failures[0]).toMatchObject({ source: "espn", kind: "unavailable" });
  });

  it("nenhuma fonte sabe buscar → 'unsupported'", async () => {
    await expect(orchestrator(source("espn")).searchTeams("flamengo")).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("todas as fontes que buscam falham → AllSourcesFailedError", async () => {
    const espn = source("espn", async () => {
      throw new DataSourceError("unavailable", "caiu", { source: "espn" });
    });
    await expect(orchestrator(espn).searchTeams("flamengo")).rejects.toBeInstanceOf(AllSourcesFailedError);
  });
});
