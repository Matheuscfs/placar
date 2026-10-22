import { DataSourceError, type DataSourceErrorKind } from "@/lib/data/errors";
import type { SourceId } from "@/lib/domain/types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpOptions {
  source: SourceId;
  /** Nome legível da fonte nas mensagens de erro. */
  label: string;
  fetch: FetchLike;
  timeoutMs: number;
  headers?: Record<string, string>;
  /** Como tratar 401/403. Padrão: a fonte está indisponível. football-data usa `unsupported` (recurso fora do plano). */
  forbiddenAs?: DataSourceErrorKind;
}

/**
 * GET com a tradução padrão de falhas em `DataSourceError`, para o orquestrador decidir o
 * fallback pelo `kind` sem conhecer HTTP: 429 → rate_limited, 404 → not_found, 5xx → unavailable,
 * estouro de tempo → timeout, falha de rede → unavailable.
 */
export async function request(url: string, o: HttpOptions): Promise<Response> {
  let res: Response;
  try {
    res = await o.fetch(url, {
      signal: AbortSignal.timeout(o.timeoutMs),
      headers: { "user-agent": "placar/0.1", ...o.headers },
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new DataSourceError("timeout", `${o.label} não respondeu em ${o.timeoutMs} ms`, { source: o.source, cause: e });
    }
    throw new DataSourceError("unavailable", `Falha de rede ao consultar ${o.label}`, { source: o.source, cause: e });
  }

  const fail = (kind: DataSourceErrorKind, message: string) => new DataSourceError(kind, message, { source: o.source, status: res.status });
  if (res.status === 429) throw fail("rate_limited", `${o.label}: limite de requisições (HTTP 429)`);
  if (res.status === 404) throw fail("not_found", `${o.label}: recurso não encontrado`);
  // 401 = credencial recusada (configuração quebrada: deve aparecer como falha); 403 = recurso fora do plano.
  if (res.status === 401) throw fail("unavailable", `${o.label}: credencial recusada (HTTP 401)`);
  if (res.status === 403) throw fail(o.forbiddenAs ?? "unavailable", `${o.label}: acesso negado (HTTP 403)`);
  if (res.status >= 500) throw fail("unavailable", `${o.label} indisponível (HTTP ${res.status})`);
  if (!res.ok) throw fail("bad_response", `${o.label} recusou a consulta (HTTP ${res.status})`);
  return res;
}

export async function requestJson<T>(url: string, o: HttpOptions): Promise<T> {
  const res = await request(url, { ...o, headers: { accept: "application/json", ...o.headers } });
  try {
    return (await res.json()) as T;
  } catch (e) {
    throw new DataSourceError("bad_response", `${o.label} devolveu algo que não é JSON`, { source: o.source, status: res.status, cause: e });
  }
}

export async function requestText(url: string, o: HttpOptions): Promise<string> {
  const res = await request(url, o);
  try {
    return await res.text();
  } catch (e) {
    throw new DataSourceError("bad_response", `${o.label}: corpo ilegível`, { source: o.source, status: res.status, cause: e });
  }
}
