import type { Metadata } from "next";
import Link from "next/link";
import { PUBLIC_LEAGUES } from "@/lib/ui/leagues";

export const metadata: Metadata = {
  title: "Tabelas de classificação dos campeonatos",
  description: "Classificação atualizada dos campeonatos de futebol: Brasileirão, Libertadores, ligas europeias e mais.",
  alternates: { canonical: "/liga" },
};

/** Os campeonatos agrupados por país (ou continente), na ordem do catálogo. Quem não tem tabela (copas) explica isso na própria página do campeonato. */
export default function LeaguesPage() {
  const groups = new Map<string, typeof PUBLIC_LEAGUES[number][]>();
  for (const l of PUBLIC_LEAGUES) (groups.get(l.country) ?? groups.set(l.country, []).get(l.country)!).push(l);

  return (
    <div className="pt-3">
      <h1 className="text-[2.1rem] font-bold leading-[1.1]">Tabelas</h1>
      <p className="mt-2 max-w-[46ch] text-muted">Escolha um campeonato para ver a classificação.</p>
      {[...groups].map(([country, leagues]) => (
        <section key={country} aria-labelledby={`pais-${country}`} className="mt-8">
          <h2 id={`pais-${country}`} className="text-[1.05rem] font-bold">
            {country}
          </h2>
          <ul className="mt-1">
            {leagues.map((l) => (
              <li key={l.id}>
                <Link href={`/liga/${l.id}`} className="-mx-3 flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-surface">
                  <span className="font-medium">{l.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
