import { ApiError, handle } from "@/lib/api/http";
import { readJsonBody } from "@/lib/push/http";
import { getPushStore, PushStoreFullError } from "@/lib/push/store";
import { parseSubscription, parseTeamKeys, subscriberId } from "@/lib/push/subscription";
import { isPushConfigured } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe — `{ subscription, teams }`: registra o aparelho (ou atualiza a lista de
 * times favoritos dele, se já estava registrado). `subscription` é o `PushSubscription.toJSON()` do
 * navegador e `teams` são as chaves dos times favoritos. Não há conta: o aparelho é o próprio endpoint.
 */
export async function POST(request: Request) {
  return handle(async () => {
    if (!isPushConfigured()) throw new ApiError(503, "push_not_configured", "Os avisos não estão ativos neste servidor.");
    const body = (await readJsonBody(request)) as { subscription?: unknown; teams?: unknown } | null;
    const subscription = parseSubscription(body?.subscription);
    const teams = parseTeamKeys(body?.teams);
    if (!subscription) throw new ApiError(400, "bad_request", "Inscrição inválida.");
    if (!teams) throw new ApiError(400, "bad_request", "Lista de times inválida.");

    const now = new Date().toISOString();
    try {
      await getPushStore().upsertSubscriber({ id: subscriberId(subscription.endpoint), subscription, teams, createdAt: now, updatedAt: now });
    } catch (e) {
      if (e instanceof PushStoreFullError) throw new ApiError(503, "push_full", "Não é possível aceitar novas inscrições agora.");
      throw e;
    }
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  });
}
