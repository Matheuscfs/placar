import { describe, expect, it } from "vitest";
import { PandaScoreClient } from "./client";
import { convertMatches, dayRange } from "./pandascore";
import { todayIso } from "@/lib/domain/dates";

/**
 * Teste com a API REAL do PandaScore. Desligado por padrão (precisa do token que só o dono pode criar):
 *
 *   PANDASCORE_TOKEN=seu_token npx vitest run src/lib/esports/pandascore.live.test.ts
 *
 * Serve para confirmar que o formato real bate com o que o conversor espera (as fixtures foram escritas
 * pela documentação). Faz 1 a 3 requisições.
 */
const token = process.env.PANDASCORE_TOKEN;

describe.skipIf(!token)("PandaScore (rede real)", () => {
  const client = new PandaScoreClient({ token: token ?? "" });

  it("hoje: a lista vem no formato esperado e o conversor aproveita (quase) tudo", async () => {
    const { start, end } = dayRange(todayIso());
    const page = await client.matchesBetween(start, end);
    const converted = convertMatches(page.matches);
    console.log(`[pandascore live] recebidas=${page.matches.length} convertidas=${converted.length} truncada=${page.truncated} cotaRestante=${page.remaining}`);

    expect(Array.isArray(page.matches)).toBe(true);
    // O filtro já pede só os 3 jogos: perder partidas aqui significa que o formato real difere do documentado.
    const lost = page.matches.length - converted.length;
    expect(lost, `${lost} partida(s) descartada(s) pelo conversor: confira o formato real`).toBeLessThanOrEqual(Math.ceil(page.matches.length * 0.2));

    for (const m of converted) {
      expect(m.id).toMatch(/^pandascore:\d+$/);
      expect(["cs2", "lol", "valorant"]).toContain(m.game);
      expect(Number.isNaN(Date.parse(m.scheduledAt))).toBe(false);
      expect(m.league.length).toBeGreaterThan(0);
      for (const s of m.streams) expect(s.url.startsWith("https://")).toBe(true);
    }
  });

  it("um dia passado traz resultados (encerradas com placar e vencedor)", async () => {
    const yesterday = new Date(Date.now() - 24 * 3600_000);
    const { start, end } = dayRange(todayIso(yesterday));
    const converted = convertMatches((await client.matchesBetween(start, end)).matches);
    const finished = converted.filter((m) => m.status === "finished" && !m.forfeit);
    console.log(`[pandascore live] ontem: ${converted.length} partidas, ${finished.length} encerradas sem W.O.`);
    for (const m of finished) {
      expect(m.home.score !== null || m.away.score !== null, `${m.id} encerrada sem placar`).toBe(true);
      expect(m.home.winner || m.away.winner, `${m.id} encerrada sem vencedor`).toBe(true);
    }
  });
});
