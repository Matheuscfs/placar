import type { Match } from "@/lib/domain/types";
import type { MatchSnapshot, NotificationPayload, PushEvent } from "./types";

const score = (m: Match) => `${m.home.team.shortName} ${m.home.score ?? 0} x ${m.away.score ?? 0} ${m.away.team.shortName}`;

/**
 * Texto do aviso, em português e curto (a tela de bloqueio corta cedo). O título diz o que houve; o
 * corpo traz o placar de agora. `prev` serve para saber QUEM fez o gol.
 */
export function buildNotification(event: PushEvent, match: Match, prev?: MatchSnapshot): NotificationPayload {
  const url = `/jogo/${match.id}`;
  const tag = `placar:${match.id}`;
  const detail = (text: string) => (match.round ? `${text} · ${match.round}` : text);

  switch (event.kind) {
    case "start":
      return { title: `Começou: ${match.home.team.shortName} x ${match.away.team.shortName}`, body: detail("Bola rolando."), tag, url, renotify: false };
    case "end": {
      return { title: "Fim de jogo", body: detail(score(match)), tag, url, renotify: false };
    }
    case "goal": {
      const homeScored = (match.home.score ?? 0) > (prev?.home ?? 0);
      const awayScored = (match.away.score ?? 0) > (prev?.away ?? 0);
      // Os dois marcaram entre duas checagens (ou não sabemos quem): título neutro.
      const who = homeScored && !awayScored ? match.home.team.shortName : awayScored && !homeScored ? match.away.team.shortName : null;
      return { title: who ? `Gol do ${who}!` : "Gol!", body: detail(score(match)), tag, url, renotify: true };
    }
  }
}
