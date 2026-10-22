import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FavoritesSeed } from "@/components/favorites-seed";
import { MatchView } from "@/components/match-view";
import { getOrchestrator } from "@/lib/data/registry";
import { leagueById } from "@/lib/ui/leagues";
import { matchAbout, matchTitle } from "@/lib/ui/match-text";
import { loadInitial, readSeedFavorites } from "@/lib/ui/server";
import { parseIdParam } from "@/lib/api/http";

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
  if (!id) return { title: "Jogo" };
  // Os dados vêm do cache do orquestrador: a página e o título usam a mesma busca.
  const r = await loadInitial(() => getOrchestrator().getMatch(id));
  if (!r.ok) return { title: "Jogo" };
  const m = r.data.data;
  // Título e descrição dizem o que a página tem (e o que a pessoa buscou): onde assistir, horário, escalações; ou o resultado.
  return { title: matchTitle(m), description: matchAbout(m, leagueById(m.leagueId)?.name ?? null) };
}

export default async function MatchPage({ params }: Props) {
  const id = safeId((await params).id);
  if (!id) notFound();
  const [initial, seed] = await Promise.all([loadInitial(() => getOrchestrator().getMatch(id)), readSeedFavorites()]);
  if (!initial.ok && initial.reason === "not_found") notFound();
  return (
    <FavoritesSeed value={seed}>
      <MatchView id={id} initial={initial.ok ? initial.data : null} />
    </FavoritesSeed>
  );
}
