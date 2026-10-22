import { CIRCUIT, ERROR_LOG_SIZE } from "@/lib/config";
import { DataSourceError, LocalQuotaError } from "@/lib/data/errors";
import type { LeagueId, SourceId } from "@/lib/domain/types";

/**
 * Esta falha indica que a FONTE está doente? "Não existe", "não cobre" e a nossa própria cota
 * não indicam; indisponibilidade, estouro de tempo, resposta quebrada e o 429 da própria fonte sim.
 */
export function countsAsFailure(e: unknown): boolean {
  if (e instanceof LocalQuotaError) return false;
  if (!(e instanceof DataSourceError)) return true; // exceção inesperada: melhor desconfiar
  return e.kind === "unavailable" || e.kind === "timeout" || e.kind === "bad_response" || e.kind === "rate_limited";
}

export type CircuitState = "closed" | "open" | "half-open";

interface Circuit {
  failures: number;
  openUntil: number;
  /** Uma chamada de teste está em andamento (estado half-open). */
  probing: boolean;
  lastError: { at: number; kind: string; message: string } | null;
  lastSuccessAt: number | null;
}

export interface HealthSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
  /** Quando o disjuntor volta a permitir uma chamada de teste (ms), se aberto. */
  openUntil: number | null;
  lastError: Circuit["lastError"];
  lastSuccessAt: number | null;
}

/**
 * Disjuntor por fonte. Depois de `failureThreshold` falhas seguidas a fonte é PULADA por
 * `cooldownSeconds` — sem isso, cada requisição esperaria o timeout de 8 s de uma fonte caída
 * antes de tentar a reserva. Passado o tempo, uma única chamada de teste decide: sucesso fecha,
 * falha reabre.
 */
export class HealthTracker {
  private readonly circuits = new Map<SourceId, Circuit>();
  private readonly now: () => number;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(opts: { now?: () => number; failureThreshold?: number; cooldownSeconds?: number } = {}) {
    this.now = opts.now ?? Date.now;
    this.threshold = opts.failureThreshold ?? CIRCUIT.failureThreshold;
    this.cooldownMs = (opts.cooldownSeconds ?? CIRCUIT.cooldownSeconds) * 1000;
  }

  private circuit(source: SourceId): Circuit {
    let c = this.circuits.get(source);
    if (!c) this.circuits.set(source, (c = { failures: 0, openUntil: 0, probing: false, lastError: null, lastSuccessAt: null }));
    return c;
  }

  state(source: SourceId): CircuitState {
    const c = this.circuit(source);
    if (c.failures < this.threshold) return "closed";
    return this.now() < c.openUntil ? "open" : "half-open";
  }

  /** Pode chamar a fonte agora? No half-open, só UMA chamada de teste por vez. */
  canCall(source: SourceId): boolean {
    const c = this.circuit(source);
    const s = this.state(source);
    if (s === "closed") return true;
    if (s === "open") return false;
    if (c.probing) return false;
    c.probing = true;
    return true;
  }

  recordSuccess(source: SourceId): void {
    const c = this.circuit(source);
    c.failures = 0;
    c.openUntil = 0;
    c.probing = false;
    c.lastSuccessAt = this.now();
  }

  recordFailure(source: SourceId, error: unknown): void {
    const c = this.circuit(source);
    c.probing = false;
    c.failures += 1;
    c.lastError = {
      at: this.now(),
      kind: error instanceof DataSourceError ? error.kind : "unexpected",
      message: error instanceof Error ? error.message : String(error),
    };
    if (c.failures >= this.threshold) c.openUntil = this.now() + this.cooldownMs;
  }

  /** A chamada terminou sem dizer nada sobre a saúde (ex.: "não cobre"): só libera o teste do half-open. */
  release(source: SourceId): void {
    this.circuit(source).probing = false;
  }

  snapshot(source: SourceId): HealthSnapshot {
    const c = this.circuit(source);
    const state = this.state(source);
    return { state, consecutiveFailures: c.failures, openUntil: state === "closed" ? null : c.openUntil, lastError: c.lastError, lastSuccessAt: c.lastSuccessAt };
  }
}

export interface ErrorLogEntry {
  at: number;
  source: SourceId | null;
  operation: string;
  kind: string;
  message: string;
  leagueId?: LeagueId;
}

/** Anel com os últimos erros, para o endpoint de status (e para achar o que quebrou sem vasculhar logs). */
export class ErrorLog {
  private readonly entries: ErrorLogEntry[] = [];
  private readonly capacity: number;

  constructor(capacity: number = ERROR_LOG_SIZE) {
    this.capacity = capacity;
  }

  add(entry: ErrorLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
  }

  /** Mais recente primeiro. */
  recent(limit: number = this.capacity): ErrorLogEntry[] {
    return this.entries.slice(-limit).reverse();
  }
}
