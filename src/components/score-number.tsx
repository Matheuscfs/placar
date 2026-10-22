"use client";

import { useState } from "react";

/**
 * Um número de placar que acende uma vez quando MUDA (um gol saiu). Na primeira renderização não
 * anima. Usa o padrão oficial de "ajustar estado quando a prop muda" (sem efeito): a `key` troca
 * a cada mudança, o que reinicia a animação CSS.
 */
export function ScoreNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [flashes, setFlashes] = useState(0);
  if (value !== shown) {
    setShown(value);
    setFlashes((n) => n + 1);
  }
  return (
    <span key={flashes} className={`inline-block px-1 ${flashes > 0 ? "score-flash" : ""}`}>
      {value}
    </span>
  );
}
