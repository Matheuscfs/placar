import { handle, parseLeaguesParam, sourcedResponse } from "@/lib/api/http";
import { getOrchestrator } from "@/lib/data/registry";

export const dynamic = "force-dynamic";

/** GET /api/live?leagues=… — jogos em andamento agora (inclui intervalo). */
export async function GET(request: Request) {
  return handle(async () => {
    const q = new URL(request.url).searchParams;
    return sourcedResponse(await getOrchestrator().getLiveMatches(parseLeaguesParam(q.get("leagues"))));
  });
}
