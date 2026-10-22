import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/api/http";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * Lê o corpo JSON de um POST com teto de tamanho. Exigir `application/json` também protege contra
 * envio por formulário de outro site: esse tipo força o navegador a pedir permissão (CORS) antes.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new ApiError(415, "unsupported_media_type", "Envie o corpo como application/json.");
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large", "Corpo grande demais.");
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large", "Corpo grande demais.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "bad_request", "JSON inválido.");
  }
}

/** Compara segredos sem vazar, pelo tempo de resposta, em que posição o texto diverge. */
export function secretsMatch(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
