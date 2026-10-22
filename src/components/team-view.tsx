"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Sourced, TeamDetail } from "@/lib/domain/types";
import { groupMatches, leagueById, type LeagueGroup } from "@/lib/ui/leagues";
import { useApi } from "@/lib/ui/use-api";
import { useFavorites } from "@/lib/ui/use-favorites";
import { Crest } from "./crest";
import { DataNotices } from "./data-notices";
import { FavoriteButton } from "./favorite-button";
import { ChevronLeftIcon } from "./icons";
import { LeagueSection } from "./league-section";
import { BlockSkeleton } from "./skeletons";
import { StateMessage } from "./state-message";

/** Posição e resumo da campanha, com link para a tabela completa. */
function StandingLine({ detail }: { detail: TeamDetail }) {
  const s = detail.standing;
  const league = s ? leagueById(s.leagueId) : undefined;
  if (!s || !league) return null;
  return (
    <p className="mt-1 text-[0.98rem] text-muted">
      <Link href={`/liga/${league.id}`} className="font-semibold text-ink hover:underline hover:decoration-line hover:underline-offset-4">
        {s.row.position}º no {league.shortName}
      </Link>
      <span className="num block">
        {s.row.points} {s.row.points === 1 ? "ponto" : "pontos"} em {s.row.played} {s.row.played === 1 ? "jogo" : "jogos"}
      </span>
    </p>
  );
}

function Block({ title, groups, empty }: { title: string; groups: LeagueGroup[]; empty: string }) {
  return (
    <section className="mt-10" aria-label={title}>
      <h2 className="text-[1.35rem] font-bold">{title}</h2>
      {groups.length === 0 ? (
        <p className="mt-3 text-muted">{empty}</p>
      ) : (
        <div className="mt-3">
          {groups.map((g, i) => (
            <LeagueSection key={g.league.id} group={g} showDate priority={i === 0} />
          ))}
        </div>
      )}
    </section>
  );
}

export function TeamView({ id, initial }: { id: string; initial: Sourced<TeamDetail> | null }) {
  const { favorites, isTeam, toggleTeam } = useFavorites();
  const url = `/api/teams/${id}`;
  const api = useApi<TeamDetail>(url, { initial, initialUrl: url, nextRefreshMs: (_d, failures) => (failures > 0 ? Math.min(120_000, 15_000 * 2 ** (failures - 1)) : 300_000) });

  const detail = api.data?.data;
  // Próximos jogos do mais perto ao mais longe; resultados do mais recente ao mais antigo.
  const upcoming = useMemo(() => (detail ? groupMatches(detail.upcoming, favorites) : []), [detail, favorites]);
  const recent = useMemo(() => (detail ? groupMatches(detail.recent, favorites).map((g) => ({ ...g, matches: [...g.matches].reverse() })) : []), [detail, favorites]);

  return (
    <article className="pt-1">
      <Link href="/" className="-ml-2 inline-flex h-11 items-center gap-1 rounded-full pr-3 text-[0.95rem] font-medium text-muted hover:text-ink">
        <ChevronLeftIcon />
        Jogos
      </Link>

      {api.loading ? (
        <BlockSkeleton lines={8} />
      ) : !detail ? (
        <StateMessage tone="error" title="Não foi possível carregar o time" action={{ label: "Tentar de novo", onClick: api.refresh }}>
          {api.error ?? "Confira sua conexão e tente de novo."}
        </StateMessage>
      ) : (
        <>
          <header className="mt-2 flex items-center gap-4">
            <Crest team={detail.team} size={64} priority />
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.7rem] font-bold leading-tight">{detail.team.name}</h1>
              <StandingLine detail={detail} />
            </div>
            <FavoriteButton pressed={isTeam(detail.team.key)} onToggle={() => toggleTeam(detail.team)} name={detail.team.name} className="-mr-3" />
          </header>

          <DataNotices meta={api.data?.meta ?? null} />
          <Block title="Próximos jogos" groups={upcoming} empty="Nenhum jogo marcado nas fontes agora." />
          <Block title="Últimos resultados" groups={recent} empty="Sem resultados recentes nas fontes." />
        </>
      )}
    </article>
  );
}
