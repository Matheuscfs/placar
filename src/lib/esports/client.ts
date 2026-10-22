import { EsportsError } from "./errors";
import { ESPORTS_GAME_DEFS } from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PandaScoreClientOptions {
  token: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  baseUrl?: string;
}

export interface MatchesPage {
  matches: unknown[];
  /** Havia mais páginas do que o limite: a lista pode estar incompleta. */
  truncated: boolean;
  /** Quanto resta da cota por hora do plano (`X-Rate-Limit-Remaining`), se a API informou. */
  remaining: number | null;
}

const PAGE_SIZE = 100; // máximo que a API aceita
/** Um dia com mais de 300 partidas dos três jogos não existe na prática; o teto protege a cota (1000/h no plano grátis). */
const MAX_PAGES = 3;

/**
 * Cliente do PandaScore, só o que o Placar usa: partidas num intervalo, dos três jogos, em UMA chamada
 * por página (nada de uma chamada por jogo). Autenticação por `Authorization: Bearer`; o token NUNCA vai
 * na URL (URLs aparecem em logs). Sem cache nem cota: isso é do `EsportsService`.
 */
export class PandaScoreClient {
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(opts: PandaScoreClientOptions) {
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = opts.timeoutMs ?? 8_000;
    this.baseUrl = opts.baseUrl ?? "https://api.pandascore.co";
  }

  /** `acquire()` é chamado antes de CADA requisição HTTP; devolver `false` aborta com `rate_limited`. */
  async matchesBetween(startIso: string, endIso: string, acquire: () => boolean = () => true): Promise<MatchesPage> {
    const all: unknown[] = [];
    let remaining: number | null = null;
    let truncated = false;

    for (let page = 1; page <= MAX_PAGES; page++) {
      if (!acquire()) throw new EsportsError("rate_limited", "Cota local do PandaScore esgotada.");
      const params = new URLSearchParams({
        "filter[videogame]": ESPORTS_GAME_DEFS.map((g) => g.pandaSlug).join(","),
        "range[scheduled_at]": `${startIso},${endIso}`,
        sort: "scheduled_at",
        "page[size]": String(PAGE_SIZE),
        "page[number]": String(page),
      });
      const res = await this.get(`${this.baseUrl}/matches?${params}`);
      const header = Number(res.headers.get("x-rate-limit-remaining"));
      if (res.headers.get("x-rate-limit-remaining") !== null && Number.isFinite(header)) remaining = header;

      let body: unknown;
      try {
        body = await res.json();
      } catch (cause) {
        throw new EsportsError("bad_response", "Resposta do PandaScore não é JSON.", { cause });
      }
      if (!Array.isArray(body)) throw new EsportsError("bad_response", "Resposta do PandaScore fora do formato esperado (não é uma lista).");
      all.push(...body);
      if (body.length < PAGE_SIZE) return { matches: all, truncated: false, remaining };
      truncated = page === MAX_PAGES;
    }
    return { matches: all, truncated, remaining };
  }

  private async get(url: string): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchImpl(url, { signal: AbortSignal.timeout(this.timeoutMs), headers: { authorization: `Bearer ${this.token}`, accept: "application/json", "user-agent": "placar/0.1" } });
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : "";
      if (name === "TimeoutError" || name === "AbortError") throw new EsportsError("timeout", "O PandaScore demorou demais para responder.", { cause });
      throw new EsportsError("unavailable", "Não foi possível falar com o PandaScore.", { cause });
    }
    if (res.ok) return res;
    if (res.status === 401 || res.status === 403) throw new EsportsError("auth", "O PandaScore recusou o token.", { status: res.status });
    if (res.status === 429) throw new EsportsError("rate_limited", "O PandaScore limitou as requisições.", { status: 429 });
    throw new EsportsError("unavailable", `O PandaScore respondeu ${res.status}.`, { status: res.status });
  }
}
