import type { Match } from "@/lib/domain/types";
import type { MatchSnapshot, PushEvent } from "./types";

export function snapshotOf(match: Match, now: Date): MatchSnapshot {
  return { status: match.status, home: match.home.score, away: match.away.score, seenAt: now.toISOString() };
}

const isPlaying = (s: Match["status"]) => s === "live" || s === "halftime";

/**
 * Compara o que sabíamos (`prev`) com o jogo agora e diz o que aconteceu no intervalo.
 *
 * Regras, todas pensadas para NÃO incomodar à toa:
 *  - Sem `prev` (primeira vez que vemos o jogo) não avisa nada: pode ser um jogo que já estava no
 *    meio, e avisar "começou" ou um "gol" velho seria mentira. Só passa a valer da próxima checagem.
 *  - Um aviso de gol por checagem, mesmo que tenham saído dois gols entre uma e outra (o texto traz o
 *    placar de agora, que é o que importa).
 *  - Gol só avisa com o jogo rolando. Se o jogo acabou, o aviso de fim já traz o placar final.
 *  - Placar que DIMINUI (gol anulado pelo VAR) não gera aviso; o placar novo vira a referência.
 *  - Jogo encerrado nunca volta a avisar, nem se a fonte oscilar de status.
 *  - Adiado/suspenso/cancelado não geram aviso.
 */
export function detectEvents(prev: MatchSnapshot | undefined, match: Match): PushEvent[] {
  if (!prev || prev.status === "finished") return [];

  const base = { matchId: match.id, teamKeys: [match.home.team.key, match.away.team.key] as PushEvent["teamKeys"] };
  const wasPlaying = isPlaying(prev.status);
  const nowPlaying = isPlaying(match.status);

  if (match.status === "finished") return [{ kind: "end", ...base }];

  const events: PushEvent[] = [];
  if (!wasPlaying && nowPlaying) events.push({ kind: "start", ...base });

  // Antes do jogo o placar é 0 x 0; com o jogo rolando, placar ausente é dado ruim da fonte: não adivinhamos.
  const beforeHome = prev.home ?? (wasPlaying ? null : 0);
  const beforeAway = prev.away ?? (wasPlaying ? null : 0);
  const { score: home } = match.home;
  const { score: away } = match.away;
  if (nowPlaying && home !== null && away !== null && beforeHome !== null && beforeAway !== null && (home > beforeHome || away > beforeAway)) {
    events.push({ kind: "goal", ...base });
  }
  return events;
}
