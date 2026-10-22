import { handle, parseDateParam, parseLeaguesParam, sourcedResponse } from "@/lib/api/http";
import { getOrchestrator } from "@/lib/data/registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/matches?date=AAAA-MM-DD&leagues=brasileirao-a,libertadores
 * Jogos do dia (padrão: hoje, em Brasília), de todas as ligas ou das pedidas.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const q = new URL(request.url).searchParams;
    return sourcedResponse(await getOrchestrator().getMatchesByDate(parseDateParam(q.get("date")), parseLeaguesParam(q.get("leagues"))));
  });
}
