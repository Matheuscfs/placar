/**
 * Teste de integração contra o GitHub de verdade (arquivos reais do openfootball) e a ESPN.
 * Desligado por padrão:
 *
 *   OPENFOOTBALL_LIVE=1 npx vitest run src/lib/data/sources/openfootball/openfootball-source.live.test.ts
 *
 * O teste de aliases é o mais importante: compara os times dos arquivos do openfootball com os
 * da classificação da ESPN. Quem não casar precisa de uma entrada em `team-aliases.ts` — sem
 * ela, os favoritos de um time deixariam de valer quando o app trocar de fonte.
 */
import { describe, expect, it } from "vitest";
import { EspnSource } from "@/lib/data/sources/espn";
import { todayIso } from "@/lib/domain/dates";
import type { LeagueId } from "@/lib/domain/types";
import { OpenFootballSource } from "./openfootball-source";

describe.skipIf(!process.env.OPENFOOTBALL_LIVE)("OpenFootballSource (rede real)", () => {
  const source = new OpenFootballSource();
  const espn = new EspnSource();

  it("os times de cada liga têm a mesma chave que na ESPN (aliases completos)", async () => {
    const leagues: LeagueId[] = ["brasileirao-a", "premier-league", "la-liga", "serie-a-italia", "bundesliga"];
    const sem: string[] = [];
    for (const league of leagues) {
      const [of, es] = await Promise.all([source.getStandings(league), espn.getStandings(league)]);
      const espnKeys = new Set(es.groups.flatMap((g) => g.rows.map((r) => r.team.key)));
      const of_ = of.groups.flatMap((g) => g.rows);
      expect(of_.length, league).toBeGreaterThanOrEqual(18);
      for (const r of of_) if (!espnKeys.has(r.team.key)) sem.push(`${league}: "${r.team.name}" (chave "${r.team.key}")`);
    }
    expect(sem, `Times do openfootball sem correspondência na ESPN:\n${sem.join("\n")}`).toEqual([]);
  }, 60_000);

  it("Brasileirão: tabela calculada com 20 times e números que fecham", async () => {
    const s = await source.getStandings("brasileirao-a");
    const rows = s.groups[0].rows;
    expect(rows).toHaveLength(20);
    for (const r of rows) {
      expect(r.points).toBe(r.won * 3 + r.drawn);
      expect(r.played).toBe(r.won + r.drawn + r.lost);
    }
    expect(rows.reduce((t, r) => t + r.goalsFor, 0)).toBe(rows.reduce((t, r) => t + r.goalsAgainst, 0));
  }, 30_000);

  it("Libertadores 2026 (só existe em TXT): jogos lidos e horários em Brasília", async () => {
    const ms = await source.getMatchesByDate("2026-02-10", ["libertadores"]);
    expect(ms.length).toBeGreaterThan(0);
    for (const m of ms) {
      expect(m.leagueId).toBe("libertadores");
      expect(m.kickoff).toMatch(/^2026-02-1[01]T/);
    }
  }, 30_000);

  it("a Série A aparece nas datas em que tem rodada", async () => {
    const ms = await source.getMatchesByDate("2026-01-28", ["brasileirao-a"]);
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => m.round?.startsWith("Rodada"))).toBe(true);
  }, 30_000);

  it("informa quão defasado está: último jogo com resultado vs. hoje (só para registro)", async () => {
    const s = await source.getStandings("brasileirao-a");
    const played = s.groups[0].rows.reduce((t, r) => t + r.played, 0) / 2;
    console.info(`[openfootball] Série A: ${played} jogos com resultado de 380 (hoje: ${todayIso()})`);
    expect(played).toBeGreaterThan(0);
  }, 30_000);
});
