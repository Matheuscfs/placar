import { ApiError, errorResponse, handle } from "@/lib/api/http";
import { getOrchestrator } from "@/lib/data/registry";

export const dynamic = "force-dynamic";

/**
 * GET /api/status — saúde de cada fonte (disjuntor), cota restante, tamanho do cache e erros
 * recentes. Em produção só responde com `STATUS_TOKEN` configurado e enviado como
 * `Authorization: Bearer <token>`: o conteúdo é operacional, não é para o público.
 */
export async function GET(request: Request) {
  return handle(async () => {
    const token = process.env.STATUS_TOKEN;
    if (process.env.NODE_ENV === "production" && !token) return errorResponse(new ApiError(404, "not_found", "Não encontrado."));
    if (token && request.headers.get("authorization") !== `Bearer ${token}`) return errorResponse(new ApiError(401, "unauthorized", "Não autorizado."));
    return Response.json(getOrchestrator().status(), { headers: { "cache-control": "no-store" } });
  });
}
