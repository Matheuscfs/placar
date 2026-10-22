import { cacheControl, handle, parseDateParam } from "@/lib/api/http";
import { parseGamesParam, toApiError } from "@/lib/esports/http";
import { getEsportsService } from "@/lib/esports/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/esports/matches?date=AAAA-MM-DD&games=cs2,lol,valorant — partidas de e-sports do dia (fuso de
 * Brasília): CALENDÁRIO e RESULTADOS, sem ao vivo. Padrão: hoje, todos os jogos. Precisa de PANDASCORE_TOKEN
 * no servidor; sem ele responde 503 `esports_not_configured`.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const q = new URL(request.url).searchParams;
    const date = parseDateParam(q.get("date"));
    const games = parseGamesParam(q.get("games"));
    try {
      const result = await getEsportsService().getMatchesByDate(date, games);
      return Response.json(result, { headers: { "cache-control": cacheControl(result.meta.ttlSeconds), "x-placar-source": "pandascore", "x-placar-cache": result.meta.cache } });
    } catch (e) {
      throw toApiError(e);
    }
  });
}
