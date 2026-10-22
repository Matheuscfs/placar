import { handle, parseIdParam, sourcedResponse } from "@/lib/api/http";
import { getOrchestrator } from "@/lib/data/registry";

export const dynamic = "force-dynamic";

/** GET /api/matches/espn:bra.1:401841272 — detalhe da partida (eventos, escalações, estatísticas quando a fonte tem). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => sourcedResponse(await getOrchestrator().getMatch(parseIdParam((await params).id))));
}
