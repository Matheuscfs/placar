import { SOURCE_TIMEOUT_MS } from "@/lib/config";
import { DataSourceError } from "@/lib/data/errors";
import { requestText, type FetchLike, type HttpOptions } from "@/lib/data/http";
import type { OfSeason } from "./of-types";
import { parseFootballTxt } from "./parse-txt";
import { parseJsonSeason } from "./parse-json";

/** Ligas europeias e Brasileirão 2026: JSON. */
const JSON_BASE = "https://raw.githubusercontent.com/openfootball/football.json/master/";
/** Brasil e torneios sul-americanos: Football.TXT. */
const TXT_BASE = "https://raw.githubusercontent.com/openfootball/south-america/master/";

export interface OpenFootballClientOptions {
  fetch?: FetchLike;
  timeoutMs?: number;
}

/**
 * Baixa arquivos de temporada do GitHub (raw.githubusercontent, via CDN: sem cota de API).
 * Arquivo inexistente (404) é o caso normal de "esta liga não tem esta temporada" e vira
 * `not_found`.
 */
export class OpenFootballClient {
  private readonly http: HttpOptions;

  constructor(opts: OpenFootballClientOptions = {}) {
    this.http = {
      source: "openfootball",
      label: "openfootball (GitHub)",
      fetch: opts.fetch ?? ((input, init) => fetch(input, init)),
      timeoutMs: opts.timeoutMs ?? SOURCE_TIMEOUT_MS,
    };
  }

  async json(path: string): Promise<OfSeason> {
    const text = await requestText(JSON_BASE + path, this.http);
    let season: OfSeason | null = null;
    try {
      season = parseJsonSeason(JSON.parse(text));
    } catch {
      /* cai no erro abaixo */
    }
    if (!season) throw new DataSourceError("bad_response", `openfootball: ${path} não tem o formato esperado`, { source: "openfootball" });
    return season;
  }

  async txt(path: string, defaultYear: number): Promise<OfSeason> {
    const season = parseFootballTxt(await requestText(TXT_BASE + path, this.http), defaultYear);
    if (season.matches.length === 0) {
      throw new DataSourceError("bad_response", `openfootball: ${path} não tem nenhum jogo legível`, { source: "openfootball" });
    }
    return season;
  }
}
