import { handle, parseLeagueId, sourcedResponse } from "@/lib/api/http";
import { getOrchestrator } from "@/lib/data/registry";

export const dynamic = "force-dynamic";

/** GET /api/standings/brasileirao-a — classificação, com as zonas (G4, rebaixamento…) já marcadas. */
export async function GET(_request: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  return handle(async () => sourcedResponse(await getOrchestrator().getStandings(parseLeagueId((await params).leagueId))));
}
