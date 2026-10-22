import { TIER_ORDER } from "./pandascore";
import { isEsportsGameId, type EsportsGameId, type EsportsMatch, type EsportsStream, type EsportsTier } from "./types";

/**
 * Lógica de tela dos e-sports, sem JSX (testável) e SEM "use client": é usada tanto pela página (servidor)
 * quanto pelos componentes (navegador). Função exportada de um módulo "use client" não pode ser chamada no servidor.
 */

/** A aba de jogo da tela: um jogo ou todos. */
export type GameTab = "todos" | EsportsGameId;

/** Lê `?g=` da URL: qualquer valor que não seja um jogo conhecido vira "todos". */
export const parseGameTab = (v: string | null | undefined): GameTab => (v && isEsportsGameId(v) ? v : "todos");

export const GAME_LABEL: Record<EsportsGameId, string> = { cs2: "CS2", lol: "LoL", valorant: "Valorant" };
export const GAME_FULL_NAME: Record<EsportsGameId, string> = { cs2: "Counter-Strike 2", lol: "League of Legends", valorant: "Valorant" };

/** Torneios "principais": tiers S, A e B do PandaScore. Os demais (C, D e sem tier) são o varejo: ligas pequenas e abertas. */
export const isMainTier = (t: EsportsTier): boolean => t === "S" || t === "A" || t === "B";

export interface EsportsGroup {
  key: string;
  league: string;
  serie: string | null;
  tier: EsportsTier;
  matches: EsportsMatch[];
}

/**
 * Agrupa por campeonato (e etapa). Os grupos saem do mais importante para o menos (tier S primeiro) e,
 * em empate, do que começa mais cedo; dentro do grupo, por horário. `mainOnly` esconde os tiers menores.
 */
export function groupEsports(matches: EsportsMatch[], opts: { mainOnly?: boolean } = {}): EsportsGroup[] {
  const groups = new Map<string, EsportsGroup>();
  for (const m of matches) {
    if (opts.mainOnly && !isMainTier(m.tier)) continue;
    const key = `${m.league}\u0000${m.serie ?? ""}`;
    const g = groups.get(key);
    if (g) {
      g.matches.push(m);
      // O grupo vale pelo MELHOR tier de suas partidas.
      if (TIER_ORDER.indexOf(m.tier) < TIER_ORDER.indexOf(g.tier)) g.tier = m.tier;
    } else groups.set(key, { key, league: m.league, serie: m.serie, tier: m.tier, matches: [m] });
  }
  for (const g of groups.values()) g.matches.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
  return [...groups.values()].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.matches[0].scheduledAt.localeCompare(b.matches[0].scheduledAt) || a.league.localeCompare(b.league));
}

export const hasLiveEsports = (matches: EsportsMatch[]): boolean => matches.some((m) => m.status === "live");

const STREAM_HOSTS: Array<[RegExp, string]> = [
  [/(^|\.)twitch\.tv$/, "Twitch"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)kick\.com$/, "Kick"],
  [/(^|\.)afreecatv\.com$|(^|\.)sooplive\.co\.kr$/, "SOOP"],
  [/(^|\.)huya\.com$/, "Huya"],
  [/(^|\.)douyu\.com$/, "Douyu"],
  [/(^|\.)bilibili\.com$/, "Bilibili"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.watch$/, "Facebook"],
];

/** Nome de quem transmite, pelo endereço: "Twitch", "YouTube"… ou o próprio domínio, sem "www.". */
export function streamLabel(stream: Pick<EsportsStream, "url">): string {
  let host: string;
  try {
    host = new URL(stream.url).hostname.toLowerCase();
  } catch {
    return "Transmissão";
  }
  return STREAM_HOSTS.find(([re]) => re.test(host))?.[1] ?? host.replace(/^www\./, "");
}

/** Onde assistir antes e durante a partida; depois de encerrada, link de transmissão não serve mais. */
export const showsStreams = (m: Pick<EsportsMatch, "status">): boolean => m.status === "scheduled" || m.status === "live";

/** Rótulo falado do jogo, para leitor de tela (o texto visível é uma grade de colunas). */
export function esportsSummary(m: EsportsMatch): string {
  const name = (s: EsportsMatch["home"]) => s.team?.name ?? "a definir";
  const part = m.status === "live" || m.status === "finished" ? `${name(m.home)} ${m.home.score ?? "sem placar"}, ${name(m.away)} ${m.away.score ?? "sem placar"}` : `${name(m.home)} contra ${name(m.away)}`;
  const state = { scheduled: "agendada", live: "em andamento", finished: m.forfeit ? "encerrada por W.O." : "encerrada", postponed: "adiada", canceled: "cancelada" }[m.status];
  return `${part}, ${state}${m.bestOf ? `, melhor de ${m.bestOf}` : ""}`;
}
