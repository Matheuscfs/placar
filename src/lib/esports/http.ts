import { ApiError } from "@/lib/api/http";
import { EsportsError } from "./errors";
import { isEsportsGameId, type EsportsGameId } from "./types";

/** `cs2,lol` → jogos validados; ausente/vazio → `undefined` (todos). Jogo desconhecido → 400. */
export function parseGamesParam(raw: string | null): EsportsGameId[] | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  const unknown = ids.filter((id) => !isEsportsGameId(id));
  if (unknown.length > 0) throw new ApiError(400, "bad_request", `Jogo desconhecido: ${unknown.join(", ")}.`);
  return ids as EsportsGameId[];
}

/**
 * Traduz o erro do módulo de e-sports para o erro de API certo. O motivo real (token recusado, cota, formato
 * quebrado) fica no log do servidor; quem chama só vê "indisponível", sem pista de configuração.
 */
export function toApiError(e: unknown): unknown {
  if (!(e instanceof EsportsError)) return e;
  if (e.kind === "not_configured") return new ApiError(503, "esports_not_configured", "E-sports não está ativo neste servidor.");
  console.error(`[esports] ${e.kind}${e.status ? ` (HTTP ${e.status})` : ""}: ${e.message}`);
  return new ApiError(503, "esports_unavailable", "A fonte de e-sports está indisponível no momento. Tente de novo em instantes.");
}
