import type { ResponseMeta } from "@/lib/domain/types";

/** Nunca atualizar mais rápido que isto, mesmo que o servidor sugira menos (poupa bateria e cota). */
export const MIN_REFRESH_MS = 15_000;
/** Teto: mesmo uma tela "parada" confere de vez em quando. */
export const MAX_REFRESH_MS = 120_000;

export interface RefreshContext {
  /** Há jogo ao vivo (ou no intervalo) na tela. */
  live: boolean;
  /** A tela mostra o dia de hoje. */
  today: boolean;
  /** Houve falha na última tentativa (0 = nenhuma): aplica recuo exponencial. */
  failures?: number;
}

/**
 * Quando buscar de novo? `null` = não buscar (a tela mostra um dia passado ou futuro, sem jogo
 * ao vivo: não há o que mudar). Com jogo ao vivo segue o TTL do servidor (que já é de ~20 s);
 * hoje, sem jogo ao vivo, confere a cada minuto porque um jogo pode começar.
 *
 * Em falha, recua: 15 s → 30 s → 60 s → 120 s, em vez de martelar um servidor em apuros.
 */
export function nextRefreshMs(meta: Pick<ResponseMeta, "ttlSeconds"> | null, ctx: RefreshContext): number | null {
  const failures = ctx.failures ?? 0;
  if (failures > 0) return Math.min(MAX_REFRESH_MS, MIN_REFRESH_MS * 2 ** (failures - 1));
  if (!ctx.live && !ctx.today) return null;
  const ttl = (meta?.ttlSeconds ?? 30) * 1000;
  const wanted = ctx.live ? ttl : Math.max(ttl, 60_000);
  return Math.min(MAX_REFRESH_MS, Math.max(MIN_REFRESH_MS, wanted));
}
