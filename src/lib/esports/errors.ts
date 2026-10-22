export type EsportsErrorKind =
  /** Sem `PANDASCORE_TOKEN`: e-sports desligado neste servidor. */
  | "not_configured"
  /** O PandaScore recusou o token (401/403): token errado, expirado ou fora do plano. */
  | "auth"
  | "rate_limited"
  | "unavailable"
  | "timeout"
  /** Resposta fora do formato esperado (a API mudou?). */
  | "bad_response";

export class EsportsError extends Error {
  readonly kind: EsportsErrorKind;
  readonly status: number | null;

  constructor(kind: EsportsErrorKind, message: string, opts: { status?: number; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "EsportsError";
    this.kind = kind;
    this.status = opts.status ?? null;
  }
}
