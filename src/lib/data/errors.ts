import type { SourceFailure, SourceId } from "@/lib/domain/types";

export type DataSourceErrorKind =
  /** A fonte está fora do ar, bloqueou ou devolveu 5xx. */
  | "unavailable"
  /** Limite de requisições atingido (HTTP 429 ou cota local esgotada). */
  | "rate_limited"
  /** A fonte respondeu, mas o recurso não existe. */
  | "not_found"
  /** A fonte não cobre esta liga/recurso. O orquestrador deve tentar a próxima. */
  | "unsupported"
  /** Resposta fora do formato esperado (a fonte mudou?). */
  | "bad_response"
  | "timeout"
  /** Id malformado ou de outra fonte. */
  | "invalid_id";

export class DataSourceError extends Error {
  readonly kind: DataSourceErrorKind;
  readonly source: SourceId | null;
  readonly status: number | null;

  constructor(kind: DataSourceErrorKind, message: string, opts: { source?: SourceId; status?: number; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "DataSourceError";
    this.kind = kind;
    this.source = opts.source ?? null;
    this.status = opts.status ?? null;
  }

  /** Vale a pena tentar outra fonte? (Erros do chamador, como id inválido, não valem.) */
  get retryableWithFallback(): boolean {
    return this.kind !== "invalid_id";
  }
}

/**
 * A NOSSA cota local da fonte acabou (não é a fonte reclamando). O orquestrador pula para
 * outra fonte ou serve dado velho, e NÃO conta isso como falha da fonte no disjuntor.
 */
export class LocalQuotaError extends DataSourceError {
  readonly retryAfterSeconds: number;

  constructor(source: SourceId, retryAfterSeconds: number) {
    super("rate_limited", `Cota local de ${source} esgotada; tente em ${retryAfterSeconds}s`, { source });
    this.name = "LocalQuotaError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Nenhuma fonte conseguiu responder. Carrega o que falhou em cada uma. */
export class AllSourcesFailedError extends DataSourceError {
  readonly failures: SourceFailure[];

  constructor(message: string, failures: SourceFailure[]) {
    super("unavailable", message);
    this.name = "AllSourcesFailedError";
    this.failures = failures;
  }
}

export function isDataSourceError(e: unknown): e is DataSourceError {
  return e instanceof DataSourceError;
}
