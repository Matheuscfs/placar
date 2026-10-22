/**
 * Teste de integração contra a ESPN de verdade. Fica desligado por padrão (depende de rede,
 * de dados que mudam e de uma API não oficial). Para rodar:
 *
 *   ESPN_LIVE=1 npx vitest run src/lib/data/sources/espn/espn-source.live.test.ts
 *
 * As asserções são estruturais (formato e coerência), nunca sobre jogos específicos.
 */
import { describe, expect, it } from "vitest";
import { addDays, todayIso } from "@/lib/domain/dates";
import { EspnSource } from "./espn-source";

describe.skipIf(!process.env.ESPN_LIVE)("EspnSource ao vivo (rede real)", () => {
  const source = new EspnSource();
  const today = todayIso();

  it("jogos de uma data com rodada do Brasileirão têm times, horário e status coerentes", async () => {
    // procura nos próximos 10 dias um com jogos da Série A
    let found = [] as Awaited<ReturnType<typeof source.getMatchesByDate>>;
    for (let i = 0; i < 10 && found.length === 0; i++) found = await source.getMatchesByDate(addDays(today, i), ["brasileirao-a"]);
    expect(found.length).toBeGreaterThan(0);
    for (const m of found) {
      expect(m.id).toMatch(/^espn:bra\.1:\d+$/);
      expect(m.home.team.name).toBeTruthy();
      expect(m.kickoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(["scheduled", "live", "halftime", "finished", "postponed", "suspended", "canceled"]).toContain(m.status);
      if (m.status === "scheduled") expect(m.home.score).toBeNull();
      if (m.status === "live") expect(m.clock).toBeTruthy();
    }
  }, 30_000);

  it("ao vivo: o que vier tem placar e relógio (pode ser vazio)", async () => {
    const live = await source.getLiveMatches();
    for (const m of live) {
      expect(["live", "halftime"]).toContain(m.status);
      expect(m.home.score).not.toBeNull();
      if (m.status === "live") expect(m.clock).toMatch(/\d/);
    }
    console.info(`[live] ${live.length} jogo(s) ao vivo agora`, live.map((m) => `${m.home.team.abbr} ${m.home.score}x${m.away.score} ${m.away.team.abbr} ${m.statusText} ${m.clock ?? ""}`));
  }, 60_000);

  it("detalhe de um jogo recente: eventos e escalações coerentes com o placar", async () => {
    const recent = await source.getMatchesByDate(addDays(today, -3), ["brasileirao-a", "libertadores"]);
    const finished = recent.find((m) => m.status === "finished");
    if (!finished) return; // sem jogo encerrado nessa data
    const d = await source.getMatch(finished.id);
    const goals = d.events.filter((e) => e.score);
    if (goals.length) expect(goals.at(-1)!.score).toEqual({ home: d.home.score, away: d.away.score });
    expect(d.lineups.length).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("classificação do Brasileirão: 20 times, posições contíguas, pontos = 3V + E", async () => {
    const s = await source.getStandings("brasileirao-a");
    const rows = s.groups[0].rows;
    expect(rows).toHaveLength(20);
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    // só descontos de pontos podem deixar o total abaixo de 3V + E
    for (const r of rows) expect(r.points).toBeLessThanOrEqual(r.won * 3 + r.drawn);
    for (const r of rows) expect(r.played).toBe(r.won + r.drawn + r.lost);
  }, 30_000);

  it("página de um time", async () => {
    const standings = await source.getStandings("brasileirao-a");
    const team = standings.groups[0].rows[0].team;
    const t = await source.getTeam(team.id);
    expect(t.team.id).toBe(team.id);
    expect(t.recent.length + t.upcoming.length).toBeGreaterThan(0);
    expect(t.standing?.row.team.id).toBe(team.id);
  }, 60_000);
});
