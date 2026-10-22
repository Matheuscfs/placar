import { SOURCE_TIMEOUT_MS, env } from "@/lib/config";
import { DataSourceError } from "@/lib/data/errors";
import { requestJson, type FetchLike, type HttpOptions } from "@/lib/data/http";
import type { FdMatch, FdMatchList, FdStandings } from "./fd-types";

const BASE = "https://api.football-data.org/v4";

export interface FootballDataClientOptions {
  /** Padrão: `FOOTBALL_DATA_TOKEN`. Sem token, a fonte se declara indisponível para as ligas. */
  token?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

/**
 * Cliente da API v4. Plano grátis: 10 req/min, só 12 competições (aqui: Brasileirão A e as
 * ligas europeias do catálogo). Recurso fora do plano responde 403, que vira `unsupported`
 * (não é pane: o orquestrador deve seguir para outra fonte sem marcar esta como doente).
 */
export class FootballDataClient {
  readonly hasToken: boolean;
  private readonly http: HttpOptions;

  constructor(opts: FootballDataClientOptions = {}) {
    const token = opts.token ?? env.footballDataToken;
    this.hasToken = token.trim().length > 0;
    this.http = {
      source: "football-data",
      label: "football-data.org",
      fetch: opts.fetch ?? ((input, init) => fetch(input, init)),
      timeoutMs: opts.timeoutMs ?? SOURCE_TIMEOUT_MS,
      headers: { "X-Auth-Token": token.trim() },
      forbiddenAs: "unsupported",
    };
  }

  private get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    if (!this.hasToken) {
      return Promise.reject(new DataSourceError("unsupported", "football-data.org: defina FOOTBALL_DATA_TOKEN", { source: "football-data" }));
    }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
    const query = qs.toString();
    return requestJson<T>(`${BASE}${path}${query ? `?${query}` : ""}`, this.http);
  }

  /** Jogos entre duas datas UTC (`YYYY-MM-DD`, no máximo 10 dias), de várias competições numa chamada só. */
  matches(p: { dateFrom: string; dateTo: string; competitions: string[] }): Promise<FdMatchList> {
    return this.get("/matches", { dateFrom: p.dateFrom, dateTo: p.dateTo, competitions: p.competitions.join(",") });
  }

  /** Jogos em andamento (`IN_PLAY` e `PAUSED`). */
  liveMatches(competitions: string[]): Promise<FdMatchList> {
    return this.get("/matches", { status: "LIVE", competitions: competitions.join(",") });
  }

  match(id: number | string): Promise<FdMatch> {
    return this.get(`/matches/${encodeURIComponent(String(id))}`);
  }

  standings(code: string): Promise<FdStandings> {
    return this.get(`/competitions/${encodeURIComponent(code)}/standings`);
  }

  teamMatches(teamId: number | string, p: { status: string; limit?: number }): Promise<FdMatchList> {
    return this.get(`/teams/${encodeURIComponent(String(teamId))}/matches`, { status: p.status, limit: p.limit });
  }
}

export type { FetchLike };
