"use client";

import { useState } from "react";
import { crestUrl, monogram } from "@/lib/ui/crest";

interface CrestTeam {
  name: string;
  abbr?: string;
  logo?: string;
}

/**
 * Escudo do time — o elemento visual principal. Decorativo para leitores de tela (o nome do time
 * sempre vem escrito ao lado), então o `alt` é vazio. Sem escudo (openfootball não tem) ou com
 * escudo que não carregou, mostra as iniciais num círculo.
 */
export function Crest({ team, size = 28, priority = false }: { team: CrestTeam; size?: number; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : crestUrl(team.logo, size);
  const style = { width: size, height: size };

  if (!src) {
    return (
      <span aria-hidden style={{ ...style, fontSize: Math.max(9, size * 0.34) }} className="grid shrink-0 place-items-center rounded-full bg-surface font-bold tracking-tight text-muted">
        {monogram(team.name, team.abbr)}
      </span>
    );
  }
  return (
    // Escudos vêm de CDNs de terceiros já redimensionados (ver crestUrl): o otimizador do Next não ajudaria.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={style}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="shrink-0 object-contain"
    />
  );
}
