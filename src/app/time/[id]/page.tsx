import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FavoritesSeed } from "@/components/favorites-seed";
import { TeamView } from "@/components/team-view";
import { parseIdParam } from "@/lib/api/http";
import { getOrchestrator } from "@/lib/data/registry";
import { loadInitial, readSeedFavorites } from "@/lib/ui/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

function safeId(raw: string): string | null {
  try {
    return parseIdParam(raw);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = safeId((await params).id);
  if (!id) return { title: "Time" };
  const r = await loadInitial(() => getOrchestrator().getTeam(id));
  if (!r.ok) return { title: "Time" };
  const name = r.data.data.team.name;
  return { title: `${name}: próximos jogos, resultados e classificação`, description: `Próximos jogos, últimos resultados e posição na tabela de ${name}, com horários e onde assistir.`, alternates: { canonical: `/time/${id}` } };
}

export default async function TeamPage({ params }: Props) {
  const id = safeId((await params).id);
  if (!id) notFound();
  const [initial, seed] = await Promise.all([loadInitial(() => getOrchestrator().getTeam(id)), readSeedFavorites()]);
  if (!initial.ok && initial.reason === "not_found") notFound();
  return (
    <FavoritesSeed value={seed}>
      <TeamView id={id} initial={initial.ok ? initial.data : null} />
    </FavoritesSeed>
  );
}
