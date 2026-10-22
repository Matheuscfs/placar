/**
 * Teste de integração contra o football-data.org de verdade. Desligado por padrão: precisa de
 * token (cadastro grátis em https://www.football-data.org/client/register) e respeita o limite
 * de 10 req/min do plano grátis.
 *
 *   FOOTBALL_DATA_TOKEN=seu_token npx vitest run src/lib/data/sources/football-data/football-data-source.live.test.ts
 *
 * É ESTE teste que confirma o formato que os conversores assumem (as fixtures foram escritas
 * pela documentação). Também compara os nomes dos times com os da ESPN: quem não casar precisa
 * de um alias em `src/lib/domain/team-aliases.ts`.
 */
import { describe, expect, it } from "vitest";
import { EspnSource } from "@/lib/data/sources/espn";
import { addDays, todayIso } from "@/lib/domain/dates";
import type { LeagueId } from "@/lib/domain/types";
import { FootballDataSource } from "./football-data-source";

const token = process.env.FOOTBALL_DATA_TOKEN;

describe.skipIf(!token)("FootballDataSource com token real", () => {
  const source = new FootballDataSource();
  const today = todayIso();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("classificação do Brasileirão: 20 times, posições contíguas, pontos = 3V + E", async () => {
    const s = await source.getStandings("brasileirao-a");
    const rows = s.groups[0].rows;
    expect(rows).toHaveLength(20);
    expect(rows.map((r) => r.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const r of rows) {
      expect(r.played).toBe(r.won + r.drawn + r.lost);
      expect(r.points).toBeLessThanOrEqual(r.won * 3 + r.drawn);
    }
  }, 30_000);

  it("os nomes dos times batem com os da ESPN (senão falta alias)", async () => {
    const wanted: LeagueId[] = ["brasileirao-a", "premier-league"];
    const espn = new EspnSource();
    const sem: string[] = [];
    for (const league of wanted) {
      await sleep(7000); // 10 req/min
      const [fd, es] = await Promise.all([source.getStandings(league), espn.getStandings(league)]);
      const espnKeys = new Set(es.groups.flatMap((g) => g.rows.map((r) => r.team.key)));
      for (const r of fd.groups.flatMap((g) => g.rows)) if (!espnKeys.has(r.team.key)) sem.push(`${league}: "${r.team.name}" (chave "${r.team.key}")`);
    }
    // Se falhar, a mensagem lista exatamente o que acrescentar em team-aliases.ts.
    expect(sem, `Times sem correspondência na ESPN:\n${sem.join("\n")}`).toEqual([]);
  }, 60_000);

  it("jogos de um dia com rodada: formato, status e placar coerentes", async () => {
    let found = [] as Awaited<ReturnType<typeof source.getMatchesByDate>>;
    for (let i = -3; i < 7 && found.length === 0; i++) {
      await sleep(7000);
      found = await source.getMatchesByDate(addDays(today, i), ["brasileirao-a"]);
    }
    expect(found.length).toBeGreaterThan(0);
    for (const m of found) {
      expect(m.id).toMatch(/^football-data:\d+$/);
      expect(m.home.team.name).toBeTruthy();
      expect(m.kickoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      if (m.status === "scheduled") expect(m.home.score).toBeNull();
      if (m.status === "finished") expect(m.home.score).not.toBeNull();
    }
  }, 120_000);

  it("fora do plano grátis vira `unsupported`, não pane", async () => {
    await sleep(7000);
    await expect(source.getMatchesByDate(today, ["libertadores"])).rejects.toMatchObject({ kind: "unsupported" });
  });
});
