import { ApiError, handle } from "@/lib/api/http";
import { readJsonBody } from "@/lib/push/http";
import { getPushStore } from "@/lib/push/store";
import { isAllowedEndpoint, subscriberId } from "@/lib/push/subscription";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/unsubscribe — `{ endpoint }`: apaga o aparelho. Responde `ok` mesmo se ele não
 * estava registrado (cancelar duas vezes não é erro, e a resposta não revela quem está inscrito).
 */
export async function POST(request: Request) {
  return handle(async () => {
    const body = (await readJsonBody(request)) as { endpoint?: unknown } | null;
    if (!isAllowedEndpoint(body?.endpoint)) throw new ApiError(400, "bad_request", "Endpoint inválido.");
    await getPushStore().removeSubscriber(subscriberId(body.endpoint));
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  });
}
