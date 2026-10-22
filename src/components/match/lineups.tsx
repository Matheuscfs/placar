import Link from "next/link";
import type { Lineup, LineupPlayer, Team } from "@/lib/domain/types";
import { Crest } from "../crest";

function PlayerList({ players, label }: { players: LineupPlayer[]; label: string }) {
  return (
    <ol aria-label={label} className="mt-1">
      {players.map((p, i) => (
        <li key={`${p.shirtNumber ?? "-"}-${p.name}-${i}`} className="flex items-baseline gap-3 py-1.5">
          <span className="num w-7 shrink-0 text-right text-sm text-muted">{p.shirtNumber ?? ""}</span>
          <span className="min-w-0 flex-1 truncate text-[0.98rem] font-medium">{p.name}</span>
          {p.position ? <span className="text-xs text-muted">{p.position}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** Escalação de um time: titulares sempre visíveis, reservas recolhidos (a lista é longa e é o que menos se consulta). */
export function LineupBlock({ lineup, team }: { lineup: Lineup; team: Team }) {
  return (
    <section className="mt-8 first:mt-5" aria-label={`Escalação de ${team.name}`}>
      <div className="flex items-center gap-3">
        <Crest team={team} size={28} />
        <h3 className="min-w-0 flex-1 truncate text-[1.05rem] font-bold">
          <Link href={`/time/${team.id}`} className="hover:underline hover:decoration-line hover:underline-offset-4">
            {team.name}
          </Link>
        </h3>
        {lineup.formation ? <span className="num text-sm font-semibold text-muted">{lineup.formation}</span> : null}
      </div>
      {lineup.coach ? <p className="mt-1 text-sm text-muted">Técnico: {lineup.coach}</p> : null}
      <PlayerList players={lineup.starters} label={`Titulares de ${team.name}`} />
      {lineup.bench.length > 0 ? (
        <details className="mt-2">
          <summary className="flex h-11 cursor-pointer items-center text-[0.95rem] font-semibold text-muted hover:text-ink">Reservas ({lineup.bench.length})</summary>
          <PlayerList players={lineup.bench} label={`Reservas de ${team.name}`} />
        </details>
      ) : null}
    </section>
  );
}
