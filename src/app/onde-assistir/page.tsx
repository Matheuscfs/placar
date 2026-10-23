import type { Metadata } from "next";
import { FavoritesSeed } from "@/components/favorites-seed";
import { WhereToWatchView } from "@/components/where-to-watch-view";
import { getOrchestrator } from "@/lib/data/registry";
import { todayIso } from "@/lib/domain/dates";
import { isAllowedDate } from "@/lib/ui/days";
import { loadInitial, readSeedFavorites } from "@/lib/ui/server";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const dateOf = (raw: string | string[] | undefined, today: string) => {
  const d = Array.isArray(raw) ? raw[0] : raw;
  return isAllowedDate(d, today) ? d : today;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const today = todayIso();
  const date = dateOf((await searchParams).d, today);
  const label = date === today ? "hoje" : `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  return {
    title: `Onde assistir aos jogos de ${label}: horários e canais`,
    description: `Todos os jogos de futebol de ${label} com horário e onde cada campeonato costuma passar: TV aberta, canais por assinatura e streaming.`,
    // Cada dia é uma página própria (o título e os jogos mudam); hoje é o endereço sem parâmetro.
    alternates: { canonical: date === today ? "/onde-assistir" : `/onde-assistir?d=${date}` },
  };
}

export default async function WhereToWatchPage({ searchParams }: Props) {
  const today = todayIso();
  const date = dateOf((await searchParams).d, today);
  const [initial, seed] = await Promise.all([loadInitial(() => getOrchestrator().getMatchesByDate(date)), readSeedFavorites()]);
  return (
    <FavoritesSeed value={seed}>
      <WhereToWatchView today={today} initialDate={date} initial={initial.ok ? initial.data : null} />
    </FavoritesSeed>
  );
}
