import { ApiError, handle } from "@/lib/api/http";
import { getOrchestrator } from "@/lib/data/registry";
import { runPushCheck } from "@/lib/push/check";
import { secretsMatch } from "@/lib/push/http";
import { WebPushSender } from "@/lib/push/sender";
import { getPushStore } from "@/lib/push/store";
import { getVapidConfig } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";
// O envio usa `web-push` (módulos do Node): nada de Edge.
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/cron/push — o job de avisos: confere os jogos dos times favoritos e avisa início, gols e fim.
 * Quem chama é um agendador (Vercel Cron, GitHub Actions, cron-job.org…), com
 * `Authorization: Bearer <CRON_SECRET>` (é o formato que a Vercel Cron já envia sozinha).
 * Em produção, sem `CRON_SECRET` configurado a rota não existe (404), para ninguém disparar o job à toa.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret && process.env.NODE_ENV === "production") throw new ApiError(404, "not_found", "Não encontrado.");
    if (secret && !secretsMatch(request.headers.get("authorization"), `Bearer ${secret}`)) throw new ApiError(401, "unauthorized", "Não autorizado.");

    const vapid = getVapidConfig();
    if (!vapid) throw new ApiError(503, "push_not_configured", "Chaves VAPID ausentes ou inválidas: veja docs/NOTIFICACOES.md.");

    const report = await runPushCheck({ orchestrator: getOrchestrator(), store: getPushStore(), sender: new WebPushSender(vapid) });
    return Response.json(report, { headers: { "cache-control": "no-store" } });
  });
}
