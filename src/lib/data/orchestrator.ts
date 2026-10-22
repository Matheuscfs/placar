import { STALE, TTL } from "@/lib/config";
import { TtlCache, type CacheOutcome, type Resolved } from "@/lib/data/cache";
import type { DataSource, SourceCapabilities, TeamQuery } from "@/lib/data/data-source";
import { AllSourcesFailedError, DataSourceError, LocalQuotaError } from "@/lib/data/errors";
import { ErrorLog, HealthTracker, countsAsFailure, type ErrorLogEntry, type HealthSnapshot } from "@/lib/data/health";
import { RateLimiter } from "@/lib/data/rate-limiter";
import { addDays, todayIso } from "@/lib/domain/dates";
import { parseId } from "@/lib/domain/ids";
import { LEAGUES, getLeagueDef, toPublicLeague } from "@/lib/domain/leagues";
import type {
  CacheState,
  IsoDate,
  League,
  LeagueId,
  Match,
  MatchDetail,
  ResponseMeta,
  Sourced,
  SourceFailure,
  SourceId,
  Standings,
  TeamDetail,
} from "@/lib/domain/types";

export interface OrchestratorOptions {
  /** Em ordem de PRIORIDADE: a primeira que cobre a liga e responde, vence. */
  sources: DataSource[];
  cache?: TtlCache;
  limiter?: RateLimiter;
  health?: HealthTracker;
  errorLog?: ErrorLog;
  now?: () => number;
}

/** Um pedaço de resposta (uma liga, ou o recurso inteiro) e de onde ele veio. */
interface Piece<T> {
  source: SourceId;
  value: T;
  state: CacheOutcome;
  fetchedAt: number;
  ttlSeconds: number;
  /** Veio de uma fonte que não é a primeira da prioridade para (alguma das) ligas que cobre. */
  fallback: boolean;
  staleCause?: unknown;
  /** Quantas ligas pedidas esta parte cobre (para eleger a fonte "principal" da resposta). */
  weight: number;
}

interface Policy {
  ttlSeconds: number;
  staleSeconds: number;
}

export interface SourceStatus {
  id: SourceId;
  capabilities: SourceCapabilities;
  health: HealthSnapshot;
  quota: { remaining: number; max: number; windowSeconds: number };
}

export interface OrchestratorStatus {
  sources: SourceStatus[];
  cacheEntries: number;
  recentErrors: ErrorLogEntry[];
}

export type LeagueWithSources = League & { sources: SourceId[] };

const LIVE_STATUSES = new Set(["live", "halftime"]);
/** Um jogo "agendado" que começa em até 2 min (ou que já deveria ter começado) precisa de dado fresco. */
const IMMINENT_MS = 2 * 60_000;
/** ...mas só se o horário não for velho demais: jogo de 3 h atrás ainda "agendado" é dado ruim da fonte, não tempo real. */
const IMMINENT_MAX_AGE_MS = 3 * 3_600_000;

function toFailure(source: SourceId, e: unknown, leagueId?: LeagueId): SourceFailure {
  const f: SourceFailure = {
    source,
    kind: e instanceof DataSourceError ? e.kind : "unexpected",
    // `failures` sai na resposta pública da API. As mensagens dos DataSourceError são nossas e
    // seguras; já a de uma exceção inesperada pode ter caminhos e detalhes internos, então só o
    // log privado (/api/status) guarda o texto real.
    message: e instanceof DataSourceError ? e.message : "Erro inesperado na fonte",
  };
  if (leagueId) f.leagueId = leagueId;
  return f;
}

/**
 * Orquestrador das fontes. É a ÚNICA porta que a API usa; as fontes nunca são chamadas direto.
 *
 * - **Fonte por liga**: para cada liga, tenta as fontes que a cobrem, em ordem de prioridade.
 * - **Fallback automático**: se uma falha (ou está com o disjuntor aberto, ou sem cota), segue
 *   para a próxima. Falha numa liga não derruba as outras.
 * - **Cache por TTL** com stale-if-error e uma busca por chave de cada vez.
 * - **Cota por fonte** (nunca chama a fonte se a cota local acabou) e **disjuntor**.
 * - **Proveniência**: toda resposta diz de qual(is) fonte(s) veio, se foi fallback, a idade do
 *   dado e o que falhou. Erros ficam no log (`status()`).
 */
export class Orchestrator {
  private readonly sources: DataSource[];
  private readonly byId = new Map<SourceId, DataSource>();
  private readonly cache: TtlCache;
  private readonly limiter: RateLimiter;
  private readonly health: HealthTracker;
  private readonly errorLog: ErrorLog;
  private readonly now: () => number;

  constructor(opts: OrchestratorOptions) {
    this.now = opts.now ?? Date.now;
    this.sources = opts.sources;
    for (const s of opts.sources) this.byId.set(s.id, s);
    this.cache = opts.cache ?? new TtlCache({ now: this.now });
    this.limiter = opts.limiter ?? new RateLimiter(undefined, this.now);
    this.health = opts.health ?? new HealthTracker({ now: this.now });
    this.errorLog = opts.errorLog ?? new ErrorLog();
  }

  // ───────────────────────── Núcleo ─────────────────────────

  /**
   * Uma chamada protegida a UMA fonte: cache → (miss) disjuntor → cota → fonte.
   * Falha de verdade alimenta o disjuntor e o log; "não cobre" e "não existe" não.
   */
  private async via<T>(src: DataSource, operation: string, key: string, run: () => Promise<T>, policy: (v: T) => Policy, leagueId?: LeagueId): Promise<Resolved<T>> {
    const resolved = await this.cache.resolve<T>(
      key,
      async () => {
        if (!this.health.canCall(src.id)) throw new DataSourceError("unavailable", `${src.id} em pausa (disjuntor aberto)`, { source: src.id });
        if (!this.limiter.tryAcquire(src.id)) {
          this.health.release(src.id);
          throw new LocalQuotaError(src.id, this.limiter.retryAfterSeconds(src.id));
        }
        try {
          const value = await run();
          this.health.recordSuccess(src.id);
          const p = policy(value);
          return { value, ttlSeconds: p.ttlSeconds, staleSeconds: p.staleSeconds };
        } catch (e) {
          if (countsAsFailure(e)) {
            this.health.recordFailure(src.id, e);
            this.log(src.id, operation, e, leagueId);
          } else {
            // "Não existe" e "não cobre" não dizem se a fonte está saudável (um 404 num id bobo não
            // prova que a lista de jogos funciona): não mexem no disjuntor, só liberam o teste do half-open.
            this.health.release(src.id);
          }
          throw e;
        }
      },
      // "Não existe" fica guardado por pouco tempo: um id inválido repetido não gasta a cota.
      { negativeTtlSeconds: (e) => (e instanceof DataSourceError && e.kind === "not_found" ? TTL.notFound : null) },
    );
    return resolved;
  }

  private log(source: SourceId | null, operation: string, e: unknown, leagueId?: LeagueId): void {
    const entry: ErrorLogEntry = {
      at: this.now(),
      source,
      operation,
      kind: e instanceof DataSourceError ? e.kind : "unexpected",
      message: e instanceof Error ? e.message : String(e),
    };
    if (leagueId) entry.leagueId = leagueId;
    this.errorLog.add(entry);
  }

  private piece<T>(src: DataSource, r: Resolved<T>, fallback: boolean, weight = 1): Piece<T> {
    return { source: src.id, value: r.value, state: r.state, fetchedAt: r.fetchedAt, ttlSeconds: r.ttlSeconds, fallback, staleCause: r.staleCause, weight };
  }

  /**
   * Tenta cada fonte candidata, em ordem, até uma responder. "Não cobre" (`unsupported`) é
   * pulado em silêncio; qualquer outra falha vai para `failures` e a próxima fonte é tentada.
   */
  private async firstThatAnswers<T>(candidates: DataSource[], failures: SourceFailure[], attempt: (src: DataSource) => Promise<Resolved<T>>, leagueId?: LeagueId): Promise<Piece<T> | null> {
    for (const [i, src] of candidates.entries()) {
      try {
        const piece = this.piece(src, await attempt(src), i > 0);
        if (piece.staleCause) failures.push(toFailure(src.id, piece.staleCause, leagueId)); // servimos dado velho por causa disto
        return piece;
      } catch (e) {
        if (e instanceof DataSourceError && e.kind === "unsupported") continue;
        failures.push(toFailure(src.id, e, leagueId));
      }
    }
    return null;
  }

  private candidates(leagueId: LeagueId, needs?: (s: DataSource) => boolean): DataSource[] {
    return this.sources.filter((s) => s.supportsLeague(leagueId) && (needs?.(s) ?? true));
  }

  // ───────────────────────── Políticas de cache ─────────────────────────

  private listPolicy(matches: Match[], date: IsoDate | null): Policy {
    const now = this.now();
    const hot = matches.some((m) => {
      if (LIVE_STATUSES.has(m.status)) return true;
      if (m.status !== "scheduled") return false;
      const until = Date.parse(m.kickoff) - now;
      return until < IMMINENT_MS && until > -IMMINENT_MAX_AGE_MS;
    });
    if (hot || date === null) return { ttlSeconds: TTL.live, staleSeconds: STALE.live };
    const today = todayIso(new Date(now));
    const base = date === today ? { ttlSeconds: TTL.today, staleSeconds: STALE.today } : date < today ? { ttlSeconds: TTL.pastDay, staleSeconds: STALE.pastDay } : { ttlSeconds: TTL.futureDay, staleSeconds: STALE.futureDay };
    // Uma lista nunca deve sobreviver ao início do próximo jogo: senão um "agendado" ficaria no cache
    // depois da bola rolar (ex.: lista de amanhã buscada 10 min antes da meia-noite, TTL de 30 min).
    const untilNext = matches.filter((m) => m.status === "scheduled").map((m) => (Date.parse(m.kickoff) - now) / 1000).filter((s) => s > 0);
    if (untilNext.length === 0) return base;
    return { ...base, ttlSeconds: Math.max(TTL.live, Math.min(base.ttlSeconds, Math.floor(Math.min(...untilNext)))) };
  }

  private detailPolicy(m: MatchDetail): Policy {
    if (LIVE_STATUSES.has(m.status)) return { ttlSeconds: TTL.matchLive, staleSeconds: STALE.matchLive };
    if (m.status === "scheduled") {
      const until = Date.parse(m.kickoff) - this.now();
      if (until < IMMINENT_MS && until > -IMMINENT_MAX_AGE_MS) return { ttlSeconds: TTL.matchLive, staleSeconds: STALE.matchLive };
      return { ttlSeconds: TTL.matchScheduled, staleSeconds: STALE.matchScheduled };
    }
    return { ttlSeconds: TTL.matchFinished, staleSeconds: STALE.matchFinished };
  }

  // ───────────────────────── Montagem da resposta ─────────────────────────

  private meta(pieces: Piece<unknown>[], failures: SourceFailure[], missing: LeagueId[]): ResponseMeta {
    // Fonte "principal" = a que cobriu mais ligas; empate → a de maior prioridade.
    const counts = new Map<SourceId, number>();
    for (const p of pieces) counts.set(p.source, (counts.get(p.source) ?? 0) + p.weight);
    const ranked = this.sources.map((s) => s.id).filter((id) => counts.has(id)).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    const worst: CacheState = pieces.some((p) => p.state === "stale") ? "stale" : pieces.some((p) => p.state === "miss") ? "miss" : "hit";
    return {
      source: ranked[0],
      sources: ranked,
      fetchedAt: new Date(Math.min(...pieces.map((p) => p.fetchedAt))).toISOString().replace(/\.\d{3}Z$/, "Z"),
      cache: worst,
      ttlSeconds: Math.min(...pieces.map((p) => p.ttlSeconds)),
      fallback: pieces.some((p) => p.fallback),
      missing,
      failures,
    };
  }

  /**
   * Distribui as ligas pedidas entre as fontes, em ordem de prioridade. Cada fonte é consultada UMA
   * vez para tudo o que cobre (o `fetchFor` devolve os jogos de todas as ligas dela), e o que ela
   * entregar vale para as ligas pedidas que ela cobre. As ligas que sobram — porque a fonte falhou
   * ou não as cobre — vão para a próxima fonte. Sobrou liga no fim → `missing`.
   */
  private async fromSources(
    leagues: LeagueId[],
    needs: ((s: DataSource) => boolean) | undefined,
    fetchFor: (src: DataSource) => Promise<Resolved<Match[]>>,
    failures: SourceFailure[],
  ): Promise<{ pieces: Array<Piece<Match[]>>; missing: LeagueId[] }> {
    const remaining = new Set(leagues);
    const pieces: Array<Piece<Match[]>> = [];
    for (const src of this.sources) {
      const covered = [...remaining].filter((l) => src.supportsLeague(l) && (needs?.(src) ?? true));
      if (covered.length === 0) continue;
      try {
        const r = await fetchFor(src);
        const wanted = new Set<LeagueId>(covered);
        const fallback = covered.some((l) => this.candidates(l, needs)[0]?.id !== src.id);
        const piece = this.piece(src, { ...r, value: r.value.filter((m) => wanted.has(m.leagueId)) }, fallback, covered.length);
        if (r.staleCause) failures.push(toFailure(src.id, r.staleCause)); // servimos dado velho por causa disto
        pieces.push(piece);
        for (const l of covered) remaining.delete(l);
      } catch (e) {
        if (e instanceof DataSourceError && e.kind === "unsupported") continue;
        failures.push(toFailure(src.id, e));
      }
    }
    return { pieces, missing: [...remaining] };
  }

  private assemble(result: { pieces: Array<Piece<Match[]>>; missing: LeagueId[] }, failures: SourceFailure[], what: string): Sourced<Match[]> {
    if (result.pieces.length === 0) throw new AllSourcesFailedError(`Nenhuma fonte respondeu (${what})`, failures);
    const data = result.pieces.flatMap((p) => p.value).sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id));
    return { data, meta: this.meta(result.pieces, failures, result.missing) };
  }

  /** Todos os jogos de um dia, de todas as ligas que a fonte cobre, numa chamada: a unidade de cache das listas. */
  private dayFromSource(src: DataSource, date: IsoDate): Promise<Resolved<Match[]>> {
    return this.via(src, "matches", `day|${src.id}|${date}`, () => src.getMatchesByDate(date), (v) => this.listPolicy(v, date));
  }

  /** Valida as ligas pedidas e descarta as que nenhuma fonte configurada cobre. */
  private requested(leagueIds?: LeagueId[]): LeagueId[] {
    const wanted = leagueIds && leagueIds.length > 0 ? [...new Set(leagueIds)] : LEAGUES.map((l) => l.id);
    for (const id of wanted) getLeagueDef(id); // lança RangeError para liga desconhecida
    const covered = wanted.filter((id) => this.candidates(id).length > 0);
    if (covered.length === 0) throw new DataSourceError("unsupported", "Nenhuma fonte configurada cobre as ligas pedidas");
    return covered;
  }

  // ───────────────────────── API pública ─────────────────────────

  /** Catálogo de ligas com as fontes que cobrem cada uma. Não usa a rede. */
  getLeagues(): LeagueWithSources[] {
    return [...LEAGUES]
      .sort((a, b) => a.order - b.order)
      .map((l) => ({ ...toPublicLeague(l), sources: this.candidates(l.id).map((s) => s.id) }))
      .filter((l) => l.sources.length > 0);
  }

  /**
   * Jogos do dia. A fonte é consultada UMA vez para todas as ligas dela (a ESPN tem um feed
   * global), e o resultado é filtrado para as ligas pedidas: pedir 1 liga ou 14 custa o mesmo
   * e compartilha o mesmo cache.
   */
  async getMatchesByDate(date: IsoDate, leagueIds?: LeagueId[]): Promise<Sourced<Match[]>> {
    const leagues = this.requested(leagueIds);
    const failures: SourceFailure[] = [];
    const result = await this.fromSources(leagues, undefined, (src) => this.dayFromSource(src, date), failures);
    return this.assemble(result, failures, `jogos de ${date}`);
  }

  /**
   * Jogos em andamento, derivados das listas de HOJE e de ONTEM (dias de Brasília) que já estão em
   * cache: o ao vivo não tem chamadas próprias, então custa ~0 além da lista do dia. Ontem entra
   * porque um jogo que começou antes da meia-noite pode seguir rolando depois dela.
   *
   * Aceita como reserva fontes de placar atrasado (`delayedLive`) — a resposta vem com `fallback`.
   * Fontes sem ao vivo nenhum (openfootball) nem são consultadas: não gastam cota.
   */
  async getLiveMatches(leagueIds?: LeagueId[]): Promise<Sourced<Match[]>> {
    const leagues = this.requested(leagueIds);
    const failures: SourceFailure[] = [];
    const today = todayIso(new Date(this.now()));
    const yesterday = addDays(today, -1);
    const result = await this.fromSources(
      leagues,
      (s) => s.capabilities.live || s.capabilities.delayedLive === true,
      async (src) => {
        // Hoje é obrigatório; ontem é complemento (se falhar, o ao vivo de hoje ainda vale).
        const [t, y] = await Promise.all([this.dayFromSource(src, today), this.dayFromSource(src, yesterday).catch(() => null)]);
        const parts = y ? [t, y] : [t];
        const rank = { hit: 0, miss: 1, stale: 2 } as const;
        // Por id: se um mesmo jogo constar nas duas listas (borda entre os dias), aparece uma vez só.
        const live = new Map(parts.flatMap((p) => p.value).filter((m) => LIVE_STATUSES.has(m.status)).map((m) => [m.id, m] as const));
        return {
          value: [...live.values()],
          state: parts.map((p) => p.state).sort((a, b) => rank[b] - rank[a])[0],
          fetchedAt: Math.min(...parts.map((p) => p.fetchedAt)),
          ttlSeconds: Math.min(...parts.map((p) => p.ttlSeconds)),
          staleCause: parts.find((p) => p.staleCause)?.staleCause,
        };
      },
      failures,
    );
    return this.assemble(result, failures, "jogos ao vivo");
  }

  private sourceOf(id: string): DataSource {
    const { source } = parseId(id); // invalid_id se malformado
    const src = this.byId.get(source);
    if (!src) throw new DataSourceError("unsupported", `A fonte "${source}" não está ativa`, { source });
    return src;
  }

  /**
   * O id de uma partida pertence a UMA fonte (ids não se traduzem entre fontes), então aqui não
   * há fallback para outra fonte; há cache, cota, disjuntor e dado velho se a fonte falhar.
   */
  async getMatch(id: string): Promise<Sourced<MatchDetail>> {
    const src = this.sourceOf(id);
    const failures: SourceFailure[] = [];
    const piece = await this.single(src, failures, "match", `match|${id}`, () => src.getMatch(id), (d) => this.detailPolicy(d));
    return { data: piece.value, meta: this.meta([piece], failures, []) };
  }

  async getStandings(leagueId: LeagueId): Promise<Sourced<Standings>> {
    getLeagueDef(leagueId);
    const failures: SourceFailure[] = [];
    const candidates = this.candidates(leagueId, (s) => s.capabilities.standings);
    if (candidates.length === 0) throw new DataSourceError("unsupported", `Nenhuma fonte tem classificação para ${leagueId}`);
    const piece = await this.firstThatAnswers(
      candidates,
      failures,
      (src) => this.via(src, "standings", `standings|${src.id}|${leagueId}`, () => src.getStandings(leagueId), () => ({ ttlSeconds: TTL.standings, staleSeconds: STALE.standings }), leagueId),
      leagueId,
    );
    if (!piece) throw new AllSourcesFailedError(`Nenhuma fonte respondeu (classificação de ${leagueId})`, failures);
    return { data: piece.value, meta: this.meta([piece], failures, []) };
  }

  async getTeam(id: string, query: TeamQuery = {}): Promise<Sourced<TeamDetail>> {
    const src = this.sourceOf(id);
    const failures: SourceFailure[] = [];
    const piece = await this.single(src, failures, "team", `team|${id}|${query.leagueId ?? "-"}`, () => src.getTeam(id, query), () => ({ ttlSeconds: TTL.team, staleSeconds: STALE.team }));
    return { data: piece.value, meta: this.meta([piece], failures, []) };
  }

  /** Recurso preso a uma fonte só: o erro dela é o erro da operação (404 continua 404). */
  private async single<T>(src: DataSource, failures: SourceFailure[], operation: string, key: string, run: () => Promise<T>, policy: (v: T) => Policy): Promise<Piece<T>> {
    const r = await this.via(src, operation, key, run, policy);
    const piece = this.piece(src, r, false);
    if (piece.staleCause) failures.push(toFailure(src.id, piece.staleCause));
    return piece;
  }

  // ───────────────────────── Diagnóstico ─────────────────────────

  status(): OrchestratorStatus {
    return {
      sources: this.sources.map((s) => ({
        id: s.id,
        capabilities: s.capabilities,
        health: this.health.snapshot(s.id),
        quota: { remaining: this.limiter.remaining(s.id), ...this.limiter.limit(s.id) },
      })),
      cacheEntries: this.cache.size,
      recentErrors: this.errorLog.recent(),
    };
  }
}
