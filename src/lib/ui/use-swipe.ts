"use client";

import { useCallback, useEffect, useRef, type TouchEvent } from "react";

export interface SwipePoint {
  x: number;
  y: number;
  t: number;
}

/** Distância mínima (px), proporção horizontal/vertical e duração máxima (ms) de um gesto que conta como "arrastar". */
export const SWIPE = { minDistance: 72, ratio: 2, maxDuration: 700 } as const;

/**
 * Do ponto de partida e de chegada do dedo, o gesto foi um arrastar horizontal? Precisa ser comprido, bem mais
 * horizontal que vertical (rolar a página para baixo NÃO vale) e rápido o bastante (segurar e passear o dedo
 * não vale). `left` = o dedo foi para a esquerda.
 */
export function swipeDirection(from: SwipePoint, to: SwipePoint): "left" | "right" | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (to.t - from.t > SWIPE.maxDuration) return null;
  if (Math.abs(dx) < SWIPE.minDistance) return null;
  if (Math.abs(dx) < Math.abs(dy) * SWIPE.ratio) return null;
  return dx < 0 ? "left" : "right";
}

/** Onde o arrastar NÃO deve valer: campos de texto, faixas que rolam de lado e o que pedir com `data-no-swipe`. */
const IGNORED = "input, textarea, select, nav, [data-no-swipe]";

/**
 * Arrastar para os lados num elemento (celular). Devolve os handlers para espalhar no elemento. Sem estado
 * de React (não renderiza de novo a cada toque); um dedo só; ignora campos de texto e faixas roláveis.
 */
export function useSwipe({ onLeft, onRight }: { onLeft?: () => void; onRight?: () => void }) {
  const start = useRef<SwipePoint | null>(null);
  const handlers = useRef({ onLeft, onRight });
  useEffect(() => {
    handlers.current = { onLeft, onRight };
  });

  const onTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    const target = e.target as Element | null;
    start.current = e.touches.length === 1 && touch && !target?.closest?.(IGNORED) ? { x: touch.clientX, y: touch.clientY, t: Date.now() } : null;
  }, []);

  const onTouchEnd = useCallback((e: TouchEvent) => {
    const from = start.current;
    start.current = null;
    const touch = e.changedTouches[0];
    if (!from || !touch) return;
    const dir = swipeDirection(from, { x: touch.clientX, y: touch.clientY, t: Date.now() });
    if (dir === "left") handlers.current.onLeft?.();
    else if (dir === "right") handlers.current.onRight?.();
  }, []);

  const onTouchCancel = useCallback(() => {
    start.current = null;
  }, []);

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
