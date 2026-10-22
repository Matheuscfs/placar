import { addDays, APP_TIMEZONE, toIsoUtc, zonedTimeToUtc } from "@/lib/domain/dates";
import type { IsoDate } from "@/lib/domain/types";
import { ESPORTS_GAME_DEFS, type EsportsGameId, type EsportsMatch, type EsportsSide, type EsportsStatus, type EsportsStream, type EsportsTeam, type EsportsTier } from "./types";

/**
 * Subconjunto do que o `GET /matches` do PandaScore devolve, só com o que usamos. Escrito a partir da
 * documentação (developers.pandascore.co/reference/get_matches). Tudo é opcional/`unknown` de propósito:
 * o conversor NÃO confia no formato.
 */
export type RawRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is RawRecord => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const GAME_BY_SLUG = new Map<string, EsportsGameId>(ESPORTS_GAME_DEFS.map((g) => [g.pandaSlug, g.id]));

const STATUS: Record<string, EsportsStatus> = {
  not_started: "scheduled",
  running: "live",
  finished: "finished",
  postponed: "postponed",
  canceled: "canceled",
};

const TIERS: Record<string, EsportsTier> = { s: "S", a: "A", b: "B", c: "C", d: "D", unranked: "unranked" };

export const TIER_ORDER: readonly EsportsTier[] = ["S", "A", "B", "C", "D", "unranked"];

/** Só links `https` viram link na tela: nunca `javascript:`, `data:` nem `http` puro vindos de fora. */
function httpsUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

function team(raw: unknown): EsportsTeam | null {
  if (!isRecord(raw)) return null;
  const id = num(raw.id);
  const name = str(raw.name);
  if (id === null || !name) return null;
  return { id: `pandascore:${id}`, name, acronym: str(raw.acronym), logo: httpsUrl(raw.image_url) };
}

function streams(raw: unknown): EsportsStream[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: EsportsStream[] = [];
  for (const s of raw) {
    if (!isRecord(s)) continue;
    const url = httpsUrl(s.raw_url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, language: str(s.language), official: s.official === true, main: s.main === true });
  }
  // Principal e oficial primeiro; poucos links bastam.
  out.sort((a, b) => Number(b.main) - Number(a.main) || Number(b.official) - Number(a.official));
  return out.slice(0, 4);
}

/**
 * Converte uma partida. Devolve `null` (e o chamador descarta) quando não dá para mostrá-la com
 * honestidade: formato quebrado, jogo que não é um dos nossos, status desconhecido ou sem horário.
 */
export function convertMatch(raw: unknown): EsportsMatch | null {
  if (!isRecord(raw)) return null;
  const id = num(raw.id);
  const status = typeof raw.status === "string" ? STATUS[raw.status] : undefined;
  const game = isRecord(raw.videogame) && typeof raw.videogame.slug === "string" ? GAME_BY_SLUG.get(raw.videogame.slug) : undefined;
  const scheduledAt = toIsoUtc(str(raw.scheduled_at) ?? str(raw.begin_at) ?? undefined);
  if (id === null || !status || !game || !scheduledAt) return null;

  const league = isRecord(raw.league) ? str(raw.league.name) : null;
  const serie = isRecord(raw.serie) ? (str(raw.serie.full_name) ?? str(raw.serie.name)) : null;
  const tournament = isRecord(raw.tournament) ? str(raw.tournament.name) : null;
  const tier = isRecord(raw.tournament) && typeof raw.tournament.tier === "string" ? (TIERS[raw.tournament.tier] ?? "unranked") : "unranked";

  const opponents = (Array.isArray(raw.opponents) ? raw.opponents : []).map((o) => (isRecord(o) ? team(o.opponent) : null));
  const scores = new Map<string, number>();
  for (const r of Array.isArray(raw.results) ? raw.results : []) {
    if (!isRecord(r)) continue;
    const teamId = num(r.team_id);
    const score = num(r.score);
    if (teamId !== null && score !== null) scores.set(`pandascore:${teamId}`, score);
  }
  const winnerId = num(raw.winner_id);

  const side = (t: EsportsTeam | null): EsportsSide => ({
    team: t,
    // Placar só de partida em andamento ou encerrada (adiada/cancelada vêm com 0 x 0 que não aconteceu);
    // time sem resultado informado fica sem número (não inventamos 0).
    score: (status === "live" || status === "finished") && t ? (scores.get(t.id) ?? null) : null,
    winner: status === "finished" && !!t && winnerId !== null && t.id === `pandascore:${winnerId}`,
  });

  const matchType = str(raw.match_type);
  const games = num(raw.number_of_games);

  return {
    id: `pandascore:${id}`,
    game,
    status,
    scheduledAt,
    bestOf: matchType === "best_of" && games !== null && games > 0 ? games : null,
    forfeit: raw.forfeit === true,
    league: league ?? "Campeonato",
    serie,
    tournament,
    tier,
    home: side(opponents[0] ?? null),
    away: side(opponents[1] ?? null),
    streams: streams(raw.streams_list),
  };
}

/** Converte a lista, descartando o que não dá para mostrar, sem repetidos, em ordem de horário. */
export function convertMatches(raw: unknown[]): EsportsMatch[] {
  const byId = new Map<string, EsportsMatch>();
  for (const r of raw) {
    const m = convertMatch(r);
    if (m && !byId.has(m.id)) byId.set(m.id, m);
  }
  return [...byId.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
}

/** O dia de calendário (fuso de Brasília) como intervalo de instantes UTC `[início, fim)`. */
export function dayRange(date: IsoDate): { start: string; end: string } {
  return { start: zonedTimeToUtc(date, "00:00", APP_TIMEZONE), end: zonedTimeToUtc(addDays(date, 1), "00:00", APP_TIMEZONE) };
}
