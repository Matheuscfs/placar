import type { ReactNode } from "react";
import type { MatchEvent } from "@/lib/domain/types";
import { ArrowDownIcon, ArrowUpIcon, BallIcon } from "../icons";

const NEUTRAL_LABEL: Partial<Record<MatchEvent["type"], string>> = { kickoff: "Início do jogo", halftime: "Intervalo", fulltime: "Fim do jogo" };

/** Cartão: um retângulo na cor do cartão (a cor aqui É a informação). Segundo amarelo = amarelo + vermelho. */
function Card({ type }: { type: "yellow_card" | "second_yellow" | "red_card" }) {
  const rect = (color: string, extra = "") => <span aria-hidden className={`inline-block h-4 w-3 rounded-[3px] ${color} ${extra}`} />;
  if (type === "second_yellow") {
    return (
      <span aria-hidden className="relative inline-block h-4 w-5">
        <span className="absolute left-0 top-0 h-4 w-3 rounded-[3px] bg-card-yellow" />
        <span className="absolute left-1.5 top-0 h-4 w-3 rounded-[3px] bg-card-red ring-2 ring-bg" />
      </span>
    );
  }
  return rect(type === "yellow_card" ? "bg-card-yellow" : "bg-card-red");
}

function describe(e: MatchEvent): { icon: ReactNode; main: string; sub?: ReactNode; note?: string; spoken: string } {
  const who = e.player ?? "Jogador não informado";
  switch (e.type) {
    case "goal":
    case "penalty_goal":
    case "own_goal": {
      const note = e.type === "penalty_goal" ? "pênalti" : e.type === "own_goal" ? "gol contra" : undefined;
      return { icon: <BallIcon />, main: who, note, spoken: `Gol de ${who}${note ? ` (${note})` : ""}${e.score ? `, ${e.score.home} a ${e.score.away}` : ""}` };
    }
    case "yellow_card":
    case "second_yellow":
    case "red_card":
      return { icon: <Card type={e.type} />, main: who, spoken: `${e.type === "yellow_card" ? "Cartão amarelo" : e.type === "red_card" ? "Cartão vermelho" : "Segundo amarelo, expulsão"} para ${who}` };
    case "substitution":
      return {
        icon: <ArrowUpIcon className="text-zone-up" />,
        main: e.secondaryPlayer ?? "Substituição",
        sub: e.player ? (
          <span className="flex items-center gap-1 text-muted">
            <ArrowDownIcon className="text-zone-down" />
            {e.player}
          </span>
        ) : undefined,
        spoken: `Substituição: entra ${e.secondaryPlayer ?? "jogador"}, sai ${e.player ?? "jogador"}`,
      };
    case "missed_penalty":
      return { icon: <BallIcon className="text-muted" />, main: who, note: "pênalti perdido", spoken: `Pênalti perdido por ${who}` };
    case "var":
      return { icon: <span aria-hidden className="text-xs font-bold">VAR</span>, main: e.text ?? "Revisão do VAR", spoken: "Revisão do VAR" };
    default:
      return { icon: null, main: e.text ?? "Lance", spoken: e.text ?? "Lance" };
  }
}

function EventBody({ e, align }: { e: MatchEvent; align: "left" | "right" }) {
  const d = describe(e);
  const row = align === "right" ? "flex-row-reverse text-right" : "text-left";
  const isGoal = e.type === "goal" || e.type === "penalty_goal" || e.type === "own_goal";
  return (
    <div className={`flex items-start gap-2 ${row}`}>
      <span className="mt-[0.2rem] shrink-0">{d.icon}</span>
      <div className="min-w-0">
        <p className={`truncate text-[0.98rem] ${isGoal ? "font-bold" : "font-medium"}`}>{d.main}</p>
        {d.sub ? <p className="truncate text-sm">{d.sub}</p> : null}
        {/* Observação ("pênalti", "gol contra") e placar corrido na linha de baixo: nunca são cortados junto com o nome. */}
        {d.note || (isGoal && e.score) ? (
          <p className="num text-sm text-muted">
            {d.note}
            {d.note && isGoal && e.score ? " " : ""}
            {isGoal && e.score ? `${e.score.home} – ${e.score.away}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Linha do tempo: lances do mandante à esquerda, do visitante à direita, o minuto no centro.
 * Início, intervalo e fim cortam a lista como divisórias. Em jogo ao vivo o lance mais novo vem
 * primeiro (não é preciso rolar para ver o que acabou de acontecer); depois do jogo, em ordem.
 */
export function Timeline({ events, live, homeName, awayName }: { events: MatchEvent[]; live: boolean; homeName: string; awayName: string }) {
  const ordered = live ? [...events].reverse() : events;
  return (
    <ol className="mt-4">
      {ordered.map((e) => {
        const neutral = NEUTRAL_LABEL[e.type];
        if (neutral && e.side === null) {
          return (
            <li key={e.id} className="my-3 flex items-center gap-3 text-sm text-muted">
              <span aria-hidden className="h-px flex-1 bg-line" />
              <span>
                {neutral}
                {e.clock && e.type !== "kickoff" ? <span className="num ml-1.5">{e.clock}</span> : null}
              </span>
              <span aria-hidden className="h-px flex-1 bg-line" />
            </li>
          );
        }
        const side = e.side ?? "home";
        return (
          // minmax(0, 1fr): sem isso a coluna cresce para caber um nome comprido e empurra o minuto para fora do centro.
          <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-start gap-x-2 py-2">
            <div>
              {side === "home" ? (
                <>
                  <span className="sr-only">{homeName}: {describe(e).spoken}.</span>
                  <div aria-hidden><EventBody e={e} align="right" /></div>
                </>
              ) : null}
            </div>
            <span className="num pt-[0.1rem] text-center text-sm font-semibold text-muted">{e.clock ?? ""}</span>
            <div>
              {side === "away" ? (
                <>
                  <span className="sr-only">{awayName}: {describe(e).spoken}.</span>
                  <div aria-hidden><EventBody e={e} align="left" /></div>
                </>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
