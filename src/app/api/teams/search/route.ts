import { handle, parseSearchQuery, sourcedResponse } from "@/lib/api/http";
import { getOrchestrator } from "@/lib/data/registry";

export const dynamic = "force-dynamic";

/** GET /api/teams/search?q=flamengo — times de futebol cujo nome combina com `q` (de 2 a 60 caracteres). */
export async function GET(request: Request) {
  return handle(async () => {
    const q = parseSearchQuery(new URL(request.url).searchParams.get("q"));
    return sourcedResponse(await getOrchestrator().searchTeams(q));
  });
}
