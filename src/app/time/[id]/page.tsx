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
  return r.ok ? { title: r.data.data.team.name, description: `Próximos jogos, últimos resultados e posição de ${r.data.data.team.name}.` } : { title: "Time" };
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
