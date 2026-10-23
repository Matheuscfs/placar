import type { Metadata } from "next";
import { EsportsView } from "@/components/esports-view";
import { StateMessage } from "@/components/state-message";
import { todayIso } from "@/lib/domain/dates";
import { getEsportsService, isEsportsConfigured } from "@/lib/esports/service";
import type { EsportsResult } from "@/lib/esports/types";
import { parseGameTab } from "@/lib/esports/ui";
import { isAllowedDate } from "@/lib/ui/days";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "E-sports", description: "Calendário e resultados de CS2, League of Legends e Valorant.", alternates: { canonical: "/esports" } };

export default async function EsportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Sem token do PandaScore o servidor não tem de onde tirar as partidas: diz isso em vez de abrir uma tela quebrada.
  if (!isEsportsConfigured()) {
    return (
      <StateMessage title="E-sports ainda não está ativo">
        Este servidor não tem a fonte de dados de e-sports configurada. Quem administra o Placar precisa informar o token do PandaScore (PANDASCORE_TOKEN).
      </StateMessage>
    );
  }

  const params = await searchParams;
  const today = todayIso();
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const raw = first(params.d);
  const date = isAllowedDate(raw, today) ? raw : today;

  // A tela já sai com as partidas: se a fonte falhar, abre vazia e o navegador tenta de novo pela API.
  let initial: EsportsResult | null = null;
  try {
    initial = await getEsportsService().getMatchesByDate(date);
  } catch {
    initial = null;
  }
  return <EsportsView today={today} initialDate={date} initialGame={parseGameTab(first(params.g))} initial={initial} />;
}
