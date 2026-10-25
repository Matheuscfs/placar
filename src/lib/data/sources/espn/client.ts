import { SOURCE_TIMEOUT_MS } from "@/lib/config";
import { requestJson, type FetchLike, type HttpOptions } from "@/lib/data/http";
import type { EspnScoreboard, EspnSearchResult, EspnStandings, EspnSummary, EspnTeamSchedule } from "./espn-types";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const V2 = "https://site.api.espn.com/apis/v2/sports/soccer";
const SEARCH = "https://site.web.api.espn.com/apis/common/v3/search";

export type { FetchLike };

/**
 * Teto de jogos do feed global. A ESPN corta aqui: valores maiores não ajudam (`limit=5000`
 * devolveu só 25 jogos), então um feed que chega ao teto pode estar incompleto.
 */
export const ALL_FEED_LIMIT = 1000;

export interface EspnClientOptions {
  /** Injetável nos testes. */
  fetch?: FetchLike;
  timeoutMs?: number;
}

/**
 * Cliente HTTP da API pública (não oficial) da ESPN. Só sabe buscar; a tradução de falhas de
 * rede/HTTP em `DataSourceError` está em `data/http.ts`. Não conhece o modelo do Placar.
 *
 * Peculiaridades já verificadas: `scoreboard?dates=` aceita UM dia (`YYYYMMDD`) ou o
 * ano (`YYYY`); intervalos (`A-B`) devolvem HTTP 400.
 */
export class EspnClient {
  private readonly http: HttpOptions;

  constructor(opts: EspnClientOptions = {}) {
    this.http = {
      source: "espn",
      label: "ESPN",
      fetch: opts.fetch ?? ((input, init) => fetch(input, init)),
      timeoutMs: opts.timeoutMs ?? SOURCE_TIMEOUT_MS,
    };
  }

  getJson<T>(url: string): Promise<T> {
    return requestJson<T>(url, this.http);
  }

  /**
   * Jogos de TODAS as ligas de futebol do mundo numa chamada só (`soccer/all/scoreboard`). Um dia
   * movimentado passa de 400 jogos (~3 MB); sem data devolve o dia "atual". Conferido contra as
   * consultas por liga em 4 datas: os mesmos jogos, sem diferença.
   */
  allScoreboard(yyyymmdd?: string): Promise<EspnScoreboard> {
    return this.getJson(`${SITE}/all/scoreboard?limit=${ALL_FEED_LIMIT}${yyyymmdd ? `&dates=${yyyymmdd}` : ""}`);
  }

  /** Jogos de um dia (`YYYYMMDD`) de UMA liga. Sem data, a ESPN devolve a janela "atual" (inclui jogos em andamento). */
  scoreboard(slug: string, yyyymmdd?: string): Promise<EspnScoreboard> {
    return this.getJson(`${SITE}/${slug}/scoreboard${yyyymmdd ? `?dates=${yyyymmdd}` : ""}`);
  }

  /** Busca de times por nome, em todos os esportes (o filtro de futebol é do conversor). `limit` alto porque há muito time de base e de outros esportes. */
  searchTeams(query: string): Promise<EspnSearchResult> {
    return this.getJson(`${SEARCH}?query=${encodeURIComponent(query)}&limit=30&type=team&lang=pt&region=br`);
  }

  summary(slug: string, eventId: string): Promise<EspnSummary> {
    return this.getJson(`${SITE}/${slug}/summary?event=${encodeURIComponent(eventId)}`);
  }

  standings(slug: string): Promise<EspnStandings> {
    return this.getJson(`${V2}/${slug}/standings`);
  }

  /** `slug` = liga ou `"all"` (todas as competições do time). `fixture` = só jogos futuros. */
  teamSchedule(slug: string, teamId: string, opts: { fixture?: boolean } = {}): Promise<EspnTeamSchedule> {
    return this.getJson(`${SITE}/${slug}/teams/${encodeURIComponent(teamId)}/schedule${opts.fixture ? "?fixture=true" : ""}`);
  }
}
