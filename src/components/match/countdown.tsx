"use client";

import type { IsoDateTime } from "@/lib/domain/types";
import { formatCountdown } from "@/lib/ui/match-text";
import { useNow } from "@/lib/ui/use-now";

/**
 * "Começa em 3 h 45 min", atualizado a cada 30 s. Só aparece enquanto o jogo não começou e a hora ainda não
 * passou (jogo atrasado mostra o status normal, não uma contagem que não existe). A altura é reservada para a
 * página não "pular" quando o relógio do navegador entra (no servidor o relógio é nulo).
 */
export function Countdown({ kickoff }: { kickoff: IsoDateTime }) {
  const now = useNow(30_000);
  const text = now === null ? null : formatCountdown(Date.parse(kickoff) - now);
  return (
    <p className="num min-h-5 max-w-[7.5rem] text-center text-sm font-medium leading-tight" aria-live="off">
      {text}
    </p>
  );
}
