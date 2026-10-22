import type { LeagueId } from "./types";

/**
 * ONDE PASSA — catálogo por competição, mantido À MÃO.
 *
 * Nenhuma fonte gratuita que o Placar usa informa a transmissão de cada jogo no Brasil (a ESPN devolve o
 * campo vazio), e o Google não tem API para isso. Então o app diz onde a competição COSTUMA passar e deixa
 * claro, na tela, que o canal exato muda de jogo para jogo (os direitos são divididos entre emissoras e
 * streamings). Uma lista aqui nunca deve ser lida como "este jogo passa em X".
 *
 * Pesquisado na web em 22/10/2026, a partir de reportagens e guias de abril a outubro de 2026. REVISE quando
 * os direitos mudarem (temporada nova, renovação). Competição sem informação confiável fica de fora de
 * propósito: melhor não mostrar nada do que mostrar errado.
 *
 * Fontes: ge/Globo e guias esportivos (90min, Goal, Máquina do Esporte, MKT Esportivo), O Povo, Diário do
 * Nordeste, Diário de Pernambuco, Itatiaia, Trivela, Meio & Mensagem, Claro (guia dos estaduais).
 */
export const BROADCASTS_CHECKED_AT = "2026-10-22";

export interface BroadcastInfo {
  /** Canais e serviços onde a competição costuma passar, na ordem em que aparecem na tela. */
  channels: string[];
  /** Ressalva curta quando ela muda o que o torcedor deve esperar. */
  note?: string;
}

const VARIES = "O canal muda de jogo para jogo: confirme o do seu jogo.";

export const BROADCASTS: Partial<Record<LeagueId, BroadcastInfo>> = {
  "brasileirao-a": { channels: ["TV Globo", "SporTV", "Premiere", "Prime Video"], note: "Direitos divididos; alguns jogos também passam na CazéTV e no ge tv. " + VARIES },
  "brasileirao-b": { channels: ["TV Globo", "RedeTV!", "ESPN", "SporTV", "Premiere", "Disney+", "ge tv"], note: VARIES },
  "copa-do-brasil": { channels: ["TV Globo", "SporTV", "Premiere", "Prime Video"], note: VARIES },
  libertadores: { channels: ["ESPN", "Disney+", "TV Globo", "Paramount+"], note: "Alguns jogos são exclusivos de um serviço (por exemplo, Paramount+). " + VARIES },
  "sul-americana": { channels: ["SBT", "ESPN", "Disney+", "Paramount+"], note: "Alguns jogos são exclusivos de um serviço (por exemplo, Paramount+). " + VARIES },
  "premier-league": { channels: ["ESPN", "Disney+", "CazéTV"], note: "A CazéTV (YouTube, de graça) exibe um jogo por rodada. " + VARIES },
  "la-liga": { channels: ["CazéTV"], note: "Na temporada 2026/27, no YouTube." },
  "serie-a-italia": { channels: ["ESPN", "Disney+"], note: "Dois jogos por rodada também passam na SportyNet (TV fechada e YouTube)." },
  paulistao: { channels: ["HBO Max", "TNT Sports", "Record", "CazéTV"], note: "As fontes divergem sobre a lista completa. " + VARIES },
  carioca: { channels: ["Premiere", "TV Globo", "SporTV", "ge tv"], note: VARIES },
  mineiro: { channels: ["TV Globo", "SporTV", "Premiere"], note: VARIES },
  gaucho: { channels: ["TV Globo", "SporTV", "Premiere"], note: VARIES },
  // Sem informação confiável para a temporada atual (não mostramos nada): bundesliga, champions-league.
};

/** O que sabemos sobre onde a competição passa; `null` quando não temos informação confiável. */
export function broadcastFor(leagueId: LeagueId): BroadcastInfo | null {
  return BROADCASTS[leagueId] ?? null;
}
