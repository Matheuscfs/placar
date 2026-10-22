/**
 * Valida contra a ESPN de verdade as duas premissas em que as listas de jogos se apoiam:
 *
 *  1. o id numérico de cada liga no catálogo (`espnLeagueId`) é o que a ESPN usa;
 *  2. o feed global `all/scoreboard` traz os MESMOS jogos que as consultas por liga.
 *
 * Se a ESPN mudar qualquer uma, estes testes dizem qual. Desligado por padrão:
 *
 *   ESPN_LIVE=1 npx vitest run src/lib/data/sources/espn/espn-feed.live.test.ts
 */
import { describe, expect, it } from "vitest";
import { addDays, todayIso } from "@/lib/domain/dates";
import { LEAGUES } from "@/lib/domain/leagues";
import { EspnClient } from "./client";
import { espnLeagueIdOf } from "./convert";

describe.skipIf(!process.env.ESPN_LIVE)("feed global da ESPN (rede real)", () => {
  const client = new EspnClient();
  const espnLeagues = LEAGUES.flatMap((l) => (l.sources.espn && l.sources.espnLeagueId ? [{ id: l.id, slug: l.sources.espn, numeric: l.sources.espnLeagueId }] : []));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("o id numérico do catálogo é o que a ESPN devolve para cada liga", async () => {
    const errados: string[] = [];
    for (const l of espnLeagues) {
      const board = await client.scoreboard(l.slug, todayIso().replaceAll("-", ""));
      const real = board.leagues?.[0] && (board.leagues[0] as { id?: string }).id;
      if (real !== l.numeric) errados.push(`${l.id}: catálogo diz ${l.numeric}, a ESPN diz ${real}`);
      await sleep(120);
    }
    expect(errados, errados.join("\n")).toEqual([]);
  }, 60_000);

  it("o feed global traz exatamente os mesmos jogos que as consultas por liga", async () => {
    // procura, nos próximos dias, uma data com jogos nas nossas ligas
    let date = todayIso();
    let feed = await client.allScoreboard(date.replaceAll("-", ""));
    const ours = (b: typeof feed) => (b.events ?? []).filter((e) => espnLeagues.some((l) => l.numeric === espnLeagueIdOf(e)));
    for (let i = 1; i <= 7 && ours(feed).length === 0; i++) {
      date = addDays(todayIso(), i);
      feed = await client.allScoreboard(date.replaceAll("-", ""));
    }
    expect(ours(feed).length).toBeGreaterThan(0);
    expect(feed.events!.length).toBeLessThan(1000); // abaixo do teto: o feed não foi cortado

    const diferencas: string[] = [];
    for (const l of espnLeagues) {
      const porLiga = await client.scoreboard(l.slug, date.replaceAll("-", ""));
      const idsLiga = new Set((porLiga.events ?? []).map((e) => e.id));
      const idsFeed = new Set(ours(feed).filter((e) => espnLeagueIdOf(e) === l.numeric).map((e) => e.id));
      const faltam = [...idsLiga].filter((id) => !idsFeed.has(id));
      const sobram = [...idsFeed].filter((id) => !idsLiga.has(id));
      if (faltam.length || sobram.length) diferencas.push(`${l.id} em ${date}: faltam ${faltam.length}, sobram ${sobram.length}`);
      await sleep(120);
    }
    expect(diferencas, diferencas.join("\n")).toEqual([]);
  }, 90_000);
});
