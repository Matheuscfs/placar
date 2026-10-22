import { handle, parseIdParam, parseLeagueId, sourcedResponse } from "@/lib/api/http";
import { getOrchestrator } from "@/lib/data/registry";

export const dynamic = "force-dynamic";

/** GET /api/teams/espn:874?league=brasileirao-a — próximos jogos, últimos resultados e posição. `league` é opcional. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = parseIdParam((await params).id);
    const league = new URL(request.url).searchParams.get("league");
    return sourcedResponse(await getOrchestrator().getTeam(id, league ? { leagueId: parseLeagueId(league) } : {}));
  });
}
