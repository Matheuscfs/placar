import { handle, plainResponse } from "@/lib/api/http";
import { getOrchestrator } from "@/lib/data/registry";

export const dynamic = "force-dynamic";

/** GET /api/leagues — catálogo de ligas com as fontes que cobrem cada uma. */
export async function GET() {
  return handle(async () => plainResponse({ data: getOrchestrator().getLeagues() }, 3600));
}
