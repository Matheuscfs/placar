import { FavoritesSeed } from "@/components/favorites-seed";
import { HomeView } from "@/components/home-view";
import { getOrchestrator } from "@/lib/data/registry";
import { todayIso } from "@/lib/domain/dates";
import { isAllowedDate } from "@/lib/ui/days";
import { loadInitial, readSeedFavorites } from "@/lib/ui/server";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const today = todayIso();
  const raw = Array.isArray(params.d) ? params.d[0] : params.d;
  const date = isAllowedDate(raw, today) ? raw : today;

  // A tela já sai com os jogos do dia: o primeiro conteúdo não espera uma viagem extra pela rede.
  const [initial, seed] = await Promise.all([loadInitial(() => getOrchestrator().getMatchesByDate(date)), readSeedFavorites()]);
  return (
    <FavoritesSeed value={seed}>
      <HomeView today={today} initialDate={date} initial={initial.ok ? initial.data : null} />
    </FavoritesSeed>
  );
}
