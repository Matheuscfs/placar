import { RATE_LIMITS } from "@/lib/config";
import type { SourceId } from "@/lib/domain/types";

export interface RateLimit {
  max: number;
  windowSeconds: number;
}

/**
 * Cota por fonte em janela deslizante: no máximo `max` chamadas em qualquer intervalo de
 * `windowSeconds`. Fica ABAIXO do limite real da fonte (config.ts), para sobrar folga.
 *
 * Vale por instância do servidor. Com várias instâncias, a cota efetiva é `max × instâncias`:
 * para o plano grátis do football-data (10/min), isso importa — a solução definitiva é um
 * contador compartilhado (Redis/Edge Config); esta classe é o ponto de troca.
 */
export class RateLimiter {
  private readonly hits = new Map<SourceId, number[]>();
  private readonly limits: Record<SourceId, RateLimit>;
  private readonly now: () => number;

  constructor(limits: Record<SourceId, RateLimit> = RATE_LIMITS, now: () => number = Date.now) {
    this.limits = limits;
    this.now = now;
  }

  private window(source: SourceId): number[] {
    const limit = this.limits[source];
    const cutoff = this.now() - limit.windowSeconds * 1000;
    const list = (this.hits.get(source) ?? []).filter((t) => t > cutoff);
    this.hits.set(source, list);
    return list;
  }

  /** Reserva uma chamada. `false` = cota esgotada; NÃO chame a fonte. */
  tryAcquire(source: SourceId): boolean {
    const list = this.window(source);
    if (list.length >= this.limits[source].max) return false;
    list.push(this.now());
    return true;
  }

  remaining(source: SourceId): number {
    return Math.max(0, this.limits[source].max - this.window(source).length);
  }

  /** Segundos até a cota voltar a ter espaço (0 se já tem). */
  retryAfterSeconds(source: SourceId): number {
    const list = this.window(source);
    if (list.length < this.limits[source].max) return 0;
    return Math.max(1, Math.ceil((list[0] + this.limits[source].windowSeconds * 1000 - this.now()) / 1000));
  }

  limit(source: SourceId): RateLimit {
    return this.limits[source];
  }
}
