import type { StatLine } from "@/lib/domain/types";

/** Parte do total que cabe ao mandante (0–100). Sem dados dos dois lados, divide ao meio. */
export function homeShare(s: Pick<StatLine, "home" | "away">): number {
  const h = s.home ?? 0;
  const a = s.away ?? 0;
  if (h + a <= 0) return 50;
  return (h / (h + a)) * 100;
}

/**
 * Estatísticas em pares: valor do mandante, nome, valor do visitante, e uma barra com a proporção.
 * O lado que lidera fica em tinta forte e o outro em tom apagado — sem cor, só peso. Para
 * cartões e faltas "liderar" não é bom nem ruim, então a barra só mostra proporção.
 */
export function MatchStats({ stats }: { stats: StatLine[] }) {
  return (
    <dl className="mt-5 space-y-5">
      {stats.map((s) => {
        const share = homeShare(s);
        const homeLeads = (s.home ?? 0) > (s.away ?? 0);
        const awayLeads = (s.away ?? 0) > (s.home ?? 0);
        return (
          <div key={s.key}>
            <div className="flex items-baseline justify-between gap-3">
              <dd className={`num text-[1.05rem] ${homeLeads ? "font-bold" : "font-medium text-muted"}`}>{s.homeText ?? "–"}</dd>
              <dt className="text-center text-[0.92rem] text-muted">{s.label}</dt>
              <dd className={`num text-[1.05rem] ${awayLeads ? "font-bold" : "font-medium text-muted"}`}>{s.awayText ?? "–"}</dd>
            </div>
            <div aria-hidden className="mt-1.5 flex h-1.5 gap-1">
              <span className={`h-full rounded-full ${homeLeads ? "bg-ink" : "bg-faint"}`} style={{ width: `${share}%` }} />
              <span className={`h-full rounded-full ${awayLeads ? "bg-ink" : "bg-faint"}`} style={{ width: `${100 - share}%` }} />
            </div>
          </div>
        );
      })}
    </dl>
  );
}
