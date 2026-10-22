import { getVapidConfig } from "@/lib/push/vapid";

export const dynamic = "force-dynamic";

/**
 * GET /api/push/config — diz se os avisos estão ligados neste servidor e entrega a chave PÚBLICA
 * (a privada nunca sai do servidor). A tela só mostra o botão de avisos quando `enabled` é true.
 */
export async function GET() {
  const vapid = getVapidConfig();
  return Response.json(vapid ? { enabled: true, publicKey: vapid.publicKey } : { enabled: false }, { headers: { "cache-control": "no-store" } });
}
