"use client";

import Link from "next/link";
import { useState } from "react";
import type { League, Sourced, Standings } from "@/lib/domain/types";
import { useApi } from "@/lib/ui/use-api";
import { useFavorites } from "@/lib/ui/use-favorites";
import { DataNotices } from "./data-notices";
import { FavoriteButton } from "./favorite-button";
import { ChevronLeftIcon } from "./icons";
import { BlockSkeleton } from "./skeletons";
import { StandingsTable, ZoneLegend } from "./standings-table";
import { StateMessage } from "./state-message";
import { Tabs, panelProps } from "./tabs";

/** A classificação muda de jogo em jogo, não de segundo em segundo: confere a cada 5 min. */
const REFRESH_MS = 300_000;

export function StandingsView({ league, initial, noTable = false }: { league: League; initial: Sourced<Standings> | null; noTable?: boolean }) {
  const { isLeague, toggleLeague, isTeam } = useFavorites();
  const [group, setGroup] = useState(0);
  const url = `/api/standings/${league.id}`;
  // Competição sem tabela: nada a buscar (url nula desliga a busca e a atualização periódica).
  const api = useApi<Standings>(noTable ? null : url, { initial, initialUrl: url, nextRefreshMs: (_d, failures) => (failures > 0 ? Math.min(120_000, 15_000 * 2 ** (failures - 1)) : REFRESH_MS) });

  const data = api.data?.data;
  const groups = data?.groups ?? [];
  const current = groups[Math.min(group, Math.max(0, groups.length - 1))];
  const computed = api.data?.meta.source === "openfootball";

  return (
    <article className="pt-1">
      <Link href="/" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-full pr-3 text-[0.95rem] font-medium text-muted hover:text-ink">
        <ChevronLeftIcon />
        Jogos
      </Link>

      <header className="mt-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.7rem] font-bold leading-tight">{league.name}</h1>
          <p className="mt-1 text-[0.95rem] text-muted">
            {league.country}
            {data?.season ? `, temporada ${data.season}` : ""}
          </p>
        </div>
        <FavoriteButton pressed={isLeague(league.id)} onToggle={() => toggleLeague(league.id)} name={league.shortName} className="-mr-3 mt-0.5" />
      </header>

      <DataNotices
        meta={api.data?.meta ?? null}
        extra={computed ? "Tabela calculada a partir dos resultados: pode estar defasada e não considera confronto direto nem punições." : undefined}
      />

      {noTable ? (
        <StateMessage title="Esta competição não tem tabela de classificação" action={{ label: "Ver os jogos de hoje", href: "/" }}>
          Ela é decidida em mata-mata ou em jogos avulsos. Os jogos aparecem na tela inicial, no dia em que acontecem.
        </StateMessage>
      ) : api.loading ? (
        <BlockSkeleton lines={10} />
      ) : !current ? (
        <StateMessage tone="error" title="Não foi possível carregar a classificação" action={{ label: "Tentar de novo", onClick: api.refresh }}>
          {api.error ?? "Confira sua conexão e tente de novo."}
        </StateMessage>
      ) : (
        <>
          {groups.length > 1 ? (
            <div className="mt-5">
              <Tabs tabs={groups.map((g, i) => ({ id: String(i), label: g.name ?? `Grupo ${i + 1}` }))} value={String(group)} onChange={(id) => setGroup(Number(id))} label="Grupos" idPrefix="grupos" />
            </div>
          ) : null}
          <div {...(groups.length > 1 ? panelProps("grupos", String(group)) : {})}>
            <StandingsTable group={current} caption={`Classificação${current.name ? `, ${current.name}` : ""}: ${league.name}`} isFavorite={isTeam} />
            <ZoneLegend groups={[current]} />
          </div>
        </>
      )}
    </article>
  );
}
