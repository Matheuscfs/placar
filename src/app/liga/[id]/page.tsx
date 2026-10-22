import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StandingsView } from "@/components/standings-view";
import { getOrchestrator } from "@/lib/data/registry";
import { isLeagueId } from "@/lib/domain/leagues";
import { leagueById } from "@/lib/ui/leagues";
import { loadInitial } from "@/lib/ui/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const league = isLeagueId(id) ? leagueById(id) : undefined;
  return league ? { title: `Classificação: ${league.name}`, description: `Tabela de ${league.name}, com as zonas de classificação e rebaixamento.` } : { title: "Liga" };
}

export default async function LeaguePage({ params }: Props) {
  const { id } = await params;
  const league = isLeagueId(id) ? leagueById(id) : undefined;
  if (!league) notFound();
  // Copas, amistosos e mata-matas não têm tabela: as fontes respondem "não existe" e a página explica, sem ficar
  // tentando de novo. Falha de verdade (fonte fora do ar) é outra coisa: a tela mostra o erro e tenta de novo.
  const initial = await loadInitial(() => getOrchestrator().getStandings(league.id));
  return <StandingsView league={league} initial={initial.ok ? initial.data : null} noTable={!initial.ok && initial.reason === "not_found"} />;
}
