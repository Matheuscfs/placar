import Link from "next/link";
import type { StandingRow, StandingsGroup, Zone, ZoneTone } from "@/lib/domain/types";
import { Crest } from "./crest";
import { StarIcon } from "./icons";

const ZONE_COLOR: Record<ZoneTone, string> = {
  title: "bg-zone-up",
  qualification: "bg-zone-up",
  playoff: "bg-zone-mid",
  relegation: "bg-zone-down",
};

/** `+5`, `0`, `−3` (o sinal de menos tipográfico alinha melhor que o hífen). */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

function Row({ row, favorite, priority }: { row: StandingRow; favorite: boolean; priority: boolean }) {
  return (
    <tr className="border-b border-line/70 last:border-0">
      <td className="relative w-9 py-2.5 pl-2.5 pr-1 text-right">
        {row.zone ? <span aria-hidden className={`absolute inset-y-1.5 left-0 w-[3px] rounded-full ${ZONE_COLOR[row.zone.tone]}`} /> : null}
        <span className="num text-[0.95rem] font-semibold">{row.position}</span>
        {row.zone ? <span className="sr-only">, {row.zone.label}</span> : null}
      </td>
      <td className="max-w-0 py-2.5 pl-3 pr-2">
        <Link href={`/time/${row.team.id}`} className="flex items-center gap-2.5 hover:underline hover:decoration-line hover:underline-offset-4">
          <Crest team={row.team} size={24} priority={priority} />
          <span className="truncate text-[0.98rem] font-semibold">{row.team.name}</span>
          {favorite ? <StarIcon filled width={12} height={12} className="shrink-0 text-faint" /> : null}
        </Link>
      </td>
      <td className="num py-2.5 text-center text-[0.95rem] text-muted">{row.played}</td>
      <td className="num hidden py-2.5 text-center text-[0.95rem] text-muted sm:table-cell">{row.won}</td>
      <td className="num hidden py-2.5 text-center text-[0.95rem] text-muted sm:table-cell">{row.drawn}</td>
      <td className="num hidden py-2.5 text-center text-[0.95rem] text-muted sm:table-cell">{row.lost}</td>
      <td className="num w-10 py-2.5 text-center text-[0.95rem] text-muted">{signed(row.goalDifference)}</td>
      <td className="num w-11 py-2.5 pr-1 text-right text-[1.05rem] font-bold">{row.points}</td>
    </tr>
  );
}

/** Tabela de uma fase ou grupo. No celular esconde V, E e D (a coluna de saldo e os pontos contam a história). */
export function StandingsTable({ group, caption, isFavorite }: { group: StandingsGroup; caption: string; isFavorite: (teamKey: string) => boolean }) {
  return (
    <table className="mt-3 w-full table-fixed border-collapse">
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col className="w-9" />
        <col />
        <col className="w-8" />
        <col className="hidden w-8 sm:table-column" />
        <col className="hidden w-8 sm:table-column" />
        <col className="hidden w-8 sm:table-column" />
        <col className="w-10" />
        <col className="w-11" />
      </colgroup>
      <thead>
        <tr className="border-b border-line text-[0.82rem] font-medium text-muted">
          <th scope="col" className="py-2 pl-2.5 pr-1 text-right font-medium">
            <span className="sr-only">Posição</span>
            <span aria-hidden>#</span>
          </th>
          <th scope="col" className="py-2 pl-3 text-left font-medium">Time</th>
          <th scope="col" className="py-2 text-center font-medium"><abbr title="Jogos" className="no-underline">J</abbr></th>
          <th scope="col" className="hidden py-2 text-center font-medium sm:table-cell"><abbr title="Vitórias" className="no-underline">V</abbr></th>
          <th scope="col" className="hidden py-2 text-center font-medium sm:table-cell"><abbr title="Empates" className="no-underline">E</abbr></th>
          <th scope="col" className="hidden py-2 text-center font-medium sm:table-cell"><abbr title="Derrotas" className="no-underline">D</abbr></th>
          <th scope="col" className="py-2 text-center font-medium"><abbr title="Saldo de gols" className="no-underline">SG</abbr></th>
          <th scope="col" className="py-2 pr-1 text-right font-medium"><abbr title="Pontos" className="no-underline">Pts</abbr></th>
        </tr>
      </thead>
      <tbody>
        {group.rows.map((r, i) => (
          <Row key={r.team.id} row={r} favorite={isFavorite(r.team.key)} priority={i < 10} />
        ))}
      </tbody>
    </table>
  );
}

/** Legenda: cada faixa de cor com o nome da vaga. Só aparece o que existe na tabela. */
export function ZoneLegend({ groups }: { groups: StandingsGroup[] }) {
  const seen = new Map<string, Zone>();
  for (const g of groups) for (const r of g.rows) if (r.zone && !seen.has(r.zone.label)) seen.set(r.zone.label, r.zone);
  if (seen.size === 0) return null;
  return (
    <ul aria-label="Legenda das cores" className="mt-5 space-y-1.5 text-sm text-muted">
      {[...seen.values()].map((z) => (
        <li key={z.label} className="flex items-center gap-2.5">
          <span aria-hidden className={`h-3 w-[3px] rounded-full ${ZONE_COLOR[z.tone]}`} />
          {z.label}
        </li>
      ))}
    </ul>
  );
}
