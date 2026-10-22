import { TtlCache } from "@/lib/data/cache";
import { todayIso } from "@/lib/domain/dates";
import type { IsoDate } from "@/lib/domain/types";
import { PandaScoreClient, type MatchesPage } from "./client";
import { EsportsError } from "./errors";
import { convertMatches, dayRange } from "./pandascore";
import type { EsportsGameId, EsportsMatch, EsportsResult } from "./types";

/** TTLs em segundos. Sem ao vivo no plano grátis, hoje é conferido a cada minuto (placar muda ao fim da partida). */
export const ESPORTS_TTL = { today: 60, pastDay: 6 * 3600, futureDay: 30 * 60 } as const;
/** Quanto tempo ALÉM do TTL o último dado bom pode ser servido se o PandaScore falhar. */
export const ESPORTS_STALE = { today: 5 * 60, pastDay: 24 * 3600, futureDay: 6 * 3600 } as const;

/** O plano grátis dá 1000 requisições/hora; ficamos em 600 por instância para sobrar folga. */
export const ESPORTS_HOURLY_BUDGET = 600;

interface Cached {
  matches: EsportsMatch[];
  truncated: boolean;
}

export interface EsportsServiceOptions {
  client: { matchesBetween(start: string, end: string, acquire?: () => boolean): Promise<MatchesPage> };
  cache?: TtlCache;
  now?: () => number;
  hourlyBudget?: number;
}

export class EsportsService {
  private readonly client: EsportsServiceOptions["client"];
  private readonly cache: TtlCache;
  private readonly now: () => number;
  private readonly budget: number;
  private readonly hits: number[] = [];

  constructor(opts: EsportsServiceOptions) {
    this.client = opts.client;
    this.now = opts.now ?? Date.now;
    this.cache = opts.cache ?? new TtlCache({ now: this.now });
    this.budget = opts.hourlyBudget ?? ESPORTS_HOURLY_BUDGET;
  }

  /** Reserva uma requisição HTTP na janela deslizante de 1 h. `false` = esgotou; NÃO chame o PandaScore. */
  private acquire = (): boolean => {
    const cutoff = this.now() - 3600_000;
    while (this.hits.length > 0 && this.hits[0] <= cutoff) this.hits.shift();
    if (this.hits.length >= this.budget) return false;
    this.hits.push(this.now());
    return true;
  };

  /**
   * Partidas do dia (fuso de Brasília) dos três jogos. A unidade de cache é o DIA com todos os jogos (uma
   * a três chamadas ao PandaScore); filtrar por jogo é de graça, feito aqui, em memória.
   */
  async getMatchesByDate(date: IsoDate, games?: EsportsGameId[]): Promise<EsportsResult> {
    const today = todayIso(new Date(this.now()));
    const kind = date === today ? "today" : date < today ? "pastDay" : "futureDay";

    const resolved = await this.cache.resolve<Cached>(`esports:matches:${date}`, async () => {
      const { start, end } = dayRange(date);
      const page = await this.client.matchesBetween(start, end, this.acquire);
      return { value: { matches: convertMatches(page.matches), truncated: page.truncated }, ttlSeconds: ESPORTS_TTL[kind], staleSeconds: ESPORTS_STALE[kind] };
    });

    const wanted = games && games.length > 0 ? new Set(games) : null;
    return {
      data: wanted ? resolved.value.matches.filter((m) => wanted.has(m.game)) : resolved.value.matches,
      meta: { source: "pandascore", fetchedAt: new Date(resolved.fetchedAt).toISOString(), cache: resolved.state, ttlSeconds: resolved.ttlSeconds, truncated: resolved.value.truncated },
    };
  }
}

// ───────────────────────── Instância de produção ─────────────────────────

/** O token vem do ambiente, lido a cada chamada (testes e `next dev` mudam o ambiente depois). */
const getToken = () => process.env.PANDASCORE_TOKEN?.trim() || "";

export const isEsportsConfigured = () => getToken() !== "";

// Mesmo motivo do orquestrador: em `next dev` os módulos recarregam e, sem isto, cache e cota zerariam a cada edição.
const KEY = Symbol.for("placar.esportsService");
type Holder = { [KEY]?: { token: string; service: EsportsService } };

/** O serviço de produção, ou lança `not_configured` se não há token. Recria se o token mudar. */
export function getEsportsService(): EsportsService {
  const token = getToken();
  if (!token) throw new EsportsError("not_configured", "E-sports não está ativo neste servidor (falta PANDASCORE_TOKEN).");
  const g = globalThis as Holder;
  // PANDASCORE_BASE_URL existe só para desenvolvimento e testes (apontar para um servidor falso local).
  const baseUrl = process.env.PANDASCORE_BASE_URL?.trim() || undefined;
  if (!g[KEY] || g[KEY].token !== token) g[KEY] = { token, service: new EsportsService({ client: new PandaScoreClient({ token, baseUrl }) }) };
  return g[KEY].service;
}

/** Só para testes: troca (ou limpa, com `null`) o serviço global. */
export function setEsportsServiceForTests(service: EsportsService | null): void {
  const g = globalThis as Holder;
  if (service) g[KEY] = { token: getToken(), service };
  else delete g[KEY];
}
