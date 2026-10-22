import { formatTime } from "@/lib/ui/format";
import { esportsSummary, showsStreams, streamLabel } from "@/lib/esports/ui";
import type { EsportsMatch, EsportsSide } from "@/lib/esports/types";
import { Crest } from "./crest";

function Team({ side, dim, priority }: { side: EsportsSide; dim: boolean; priority: boolean }) {
  const t = side.team;
  return (
    <span className="flex min-w-0 items-center gap-3">
      {t ? <Crest team={{ name: t.name, abbr: t.acronym ?? undefined, logo: t.logo ?? undefined }} size={28} priority={priority} /> : <span aria-hidden className="h-7 w-7 shrink-0 rounded-full border border-dashed border-line" />}
      <span className={`truncate text-[1.02rem] ${!t ? "font-normal italic text-muted" : dim ? "font-normal text-muted" : "font-semibold"}`}>{t?.name ?? "A definir"}</span>
    </span>
  );
}

function Score({ side, dim }: { side: EsportsSide; dim: boolean }) {
  return <span className={`score flex items-center justify-end text-[1.4rem] ${dim ? "text-muted" : ""}`}>{side.score !== null ? side.score : null}</span>;
}

function Status({ m }: { m: EsportsMatch }) {
  switch (m.status) {
    case "scheduled":
      return <span className="num text-[0.98rem] font-semibold">{formatTime(m.scheduledAt)}</span>;
    case "live":
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-live">
          <span aria-hidden className="live-dot" />
          Em andamento
        </span>
      );
    case "finished":
      return <span className="text-sm text-muted">{m.forfeit ? "W.O." : "Encerrada"}</span>;
    case "postponed":
      return <span className="text-sm text-muted">Adiada</span>;
    case "canceled":
      return <span className="text-sm text-muted">Cancelada</span>;
  }
}

/**
 * Uma partida de e-sports. Mesma linguagem da linha de futebol (times em duas linhas, placar em coluna,
 * situação no extremo), mas sem página de detalhe: o que há para saber está aqui. Placar = mapas vencidos
 * na série. Embaixo: fase, formato (MD3 = melhor de 3) e onde assistir, só antes e durante a partida.
 */
export function EsportsRow({ match, priority = false }: { match: EsportsMatch; priority?: boolean }) {
  const homeWon = match.home.winner;
  const awayWon = match.away.winner;
  const showScore = match.home.score !== null || match.away.score !== null;
  const streams = showsStreams(match) ? match.streams.slice(0, 2) : [];
  const detail = [match.tournament, match.bestOf ? `MD${match.bestOf}` : null].filter(Boolean).join(" · ");

  return (
    <article aria-label={esportsSummary(match)} className="-mx-3 rounded-2xl px-3 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_6.5rem] grid-rows-[1.75rem_1.75rem] items-center gap-x-3 gap-y-2.5">
        <Team side={match.home} dim={awayWon} priority={priority} />
        {showScore ? <Score side={match.home} dim={awayWon} /> : <span />}
        <span className="row-span-2 row-start-1 col-start-3 self-center justify-self-end text-right">
          <Status m={match} />
        </span>
        <Team side={match.away} dim={homeWon} priority={priority} />
        {showScore ? <Score side={match.away} dim={homeWon} /> : <span />}
      </div>
      {detail || streams.length > 0 ? (
        <div className="mt-2 flex min-h-8 items-center justify-between gap-3 pl-10 text-sm text-muted">
          <span className="truncate">{detail}</span>
          {streams.length > 0 ? (
            <span className="flex shrink-0 items-center gap-1">
              {streams.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Assistir na ${streamLabel(s)} (abre em outra aba)`}
                  className="inline-flex h-8 items-center rounded-full px-3 font-semibold text-ink underline decoration-line underline-offset-4 hover:bg-surface hover:decoration-ink"
                >
                  {streams.length === 1 ? `Assistir · ${streamLabel(s)}` : streamLabel(s)}
                </a>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
