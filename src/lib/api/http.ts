import { DATE_WINDOW_DAYS } from "@/lib/config";
import { AllSourcesFailedError, DataSourceError, LocalQuotaError } from "@/lib/data/errors";
import { addDays, isIsoDate, todayIso } from "@/lib/domain/dates";
import { isLeagueId } from "@/lib/domain/leagues";
import type { IsoDate, LeagueId, Sourced } from "@/lib/domain/types";

/** Erro do chamador (parâmetro inválido). Vira 4xx; nunca chega às fontes. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const badRequest = (message: string) => new ApiError(400, "bad_request", message);

// ───────────────────────── Parâmetros ─────────────────────────

/**
 * `YYYY-MM-DD`, padrão = hoje (Brasília). Fora da janela [hoje−60, hoje+120] → 400: sem esse
 * limite, um cliente poderia pedir datas à vontade e gastar a cota das fontes.
 */
export function parseDateParam(raw: string | null, now: Date = new Date()): IsoDate {
  const today = todayIso(now);
  if (raw === null || raw === "") return today;
  if (!isIsoDate(raw)) throw badRequest(`Data inválida: "${raw}". Use AAAA-MM-DD.`);
  if (raw < addDays(today, -DATE_WINDOW_DAYS.past) || raw > addDays(today, DATE_WINDOW_DAYS.future)) {
    throw badRequest(`Data fora do intervalo aceito (${DATE_WINDOW_DAYS.past} dias atrás até ${DATE_WINDOW_DAYS.future} dias à frente).`);
  }
  return raw;
}

/** `a,b,c` → ligas validadas contra o catálogo; ausente/vazio → `undefined` (todas). */
export function parseLeaguesParam(raw: string | null): LeagueId[] | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
  const unknown = ids.filter((id) => !isLeagueId(id));
  if (unknown.length > 0) throw badRequest(`Liga desconhecida: ${unknown.join(", ")}.`);
  return ids as LeagueId[];
}

export function parseLeagueId(raw: string): LeagueId {
  if (!isLeagueId(raw)) throw new ApiError(404, "unknown_league", `Liga desconhecida: ${raw}.`);
  return raw;
}

const MAX_ID_LENGTH = 120;

/** Ids chegam como `espn:bra.1:123` (ou com `:` codificado). */
export function parseIdParam(raw: string): string {
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    /* já estava decodificado */
  }
  if (!id || id.length > MAX_ID_LENGTH || /[\s/\\?#]/.test(id)) throw badRequest("Identificador inválido.");
  return id;
}

// ───────────────────────── Respostas ─────────────────────────

/**
 * `Cache-Control` para o CDN da Vercel: `s-maxage` = o TTL que o orquestrador calculou para o
 * conteúdo (20 s ao vivo, 6 h para dias passados…). O `stale-while-revalidate` é curto para
 * dados rápidos: placar ao vivo velho engana.
 */
export function cacheControl(ttlSeconds: number): string {
  const ttl = Math.max(1, Math.floor(ttlSeconds));
  const swr = ttl <= 30 ? 5 : Math.min(ttl, 300);
  return `public, s-maxage=${ttl}, stale-while-revalidate=${swr}`;
}

export function sourcedResponse<T>(result: Sourced<T>): Response {
  const { meta } = result;
  const headers = new Headers({
    "cache-control": cacheControl(meta.ttlSeconds),
    "x-placar-source": meta.source,
    "x-placar-cache": meta.cache,
  });
  if (meta.fallback) headers.set("x-placar-fallback", "1");
  return Response.json(result, { headers });
}

export function plainResponse(body: unknown, ttlSeconds: number): Response {
  return Response.json(body, { headers: { "cache-control": cacheControl(ttlSeconds) } });
}

const NO_STORE = { "cache-control": "no-store" } as const;

/** Traduz qualquer erro em JSON `{ error: { code, message }, failures? }` com o status HTTP certo. */
export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: NO_STORE });

  if (e instanceof AllSourcesFailedError) {
    return Response.json(
      { error: { code: "all_sources_failed", message: "Nenhuma fonte de dados respondeu agora. Tente de novo em instantes." }, failures: e.failures },
      { status: 503, headers: { ...NO_STORE, "retry-after": "15" } },
    );
  }

  if (e instanceof DataSourceError) {
    const retry = e instanceof LocalQuotaError ? String(e.retryAfterSeconds) : "15";
    switch (e.kind) {
      case "invalid_id":
        return Response.json({ error: { code: "invalid_id", message: e.message } }, { status: 400, headers: NO_STORE });
      case "not_found":
        return Response.json({ error: { code: "not_found", message: "Não encontrado." } }, { status: 404, headers: NO_STORE });
      case "unsupported":
        return Response.json({ error: { code: "unsupported", message: e.message } }, { status: 404, headers: NO_STORE });
      default:
        return Response.json({ error: { code: e.kind, message: "Fonte de dados indisponível no momento." } }, { status: 503, headers: { ...NO_STORE, "retry-after": retry } });
    }
  }

  console.error("[api] erro inesperado:", e);
  return Response.json({ error: { code: "internal", message: "Erro interno." } }, { status: 500, headers: NO_STORE });
}

/** Envolve o corpo de uma rota: qualquer erro vira a resposta certa, nunca uma página de erro do Next. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    return errorResponse(e);
  }
}
