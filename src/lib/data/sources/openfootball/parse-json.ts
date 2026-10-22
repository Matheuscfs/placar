import type { OfMatch, OfScore, OfSeason, Pair } from "./of-types";

const isPair = (v: unknown): v is Pair => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/**
 * O `score` do football.json tem duas formas: `[2, 1]` (arquivos antigos, só o resultado
 * final) e `{ ft, ht, et, p }`. Aceita as duas; qualquer outra coisa vira "sem resultado".
 */
export function parseJsonScore(raw: unknown): OfScore | null {
  if (isPair(raw)) return { ft: raw };
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const score: OfScore = {};
    for (const k of ["ft", "ht", "et", "p"] as const) if (isPair(o[k])) score[k] = o[k];
    return Object.keys(score).length ? score : null;
  }
  return null;
}

/** `null` se o arquivo não tem a forma esperada (a fonte mudou?). Jogos malformados são descartados. */
export function parseJsonSeason(json: unknown): OfSeason | null {
  if (!json || typeof json !== "object" || !Array.isArray((json as { matches?: unknown }).matches)) return null;
  const raw = json as { name?: unknown; matches: unknown[] };

  const matches = raw.matches.flatMap((m): OfMatch[] => {
    if (!m || typeof m !== "object") return [];
    const x = m as Record<string, unknown>;
    if (typeof x.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return [];
    if (typeof x.team1 !== "string" || typeof x.team2 !== "string" || !x.team1 || !x.team2) return [];
    return [
      {
        round: typeof x.round === "string" ? x.round : "",
        date: x.date,
        // Alguns jogos vêm sem horário ("" ou ausente).
        time: typeof x.time === "string" && /^\d{1,2}:\d{2}/.test(x.time) ? x.time.slice(0, 5).padStart(5, "0") : null,
        team1: x.team1,
        team2: x.team2,
        score: parseJsonScore(x.score),
        group: typeof x.group === "string" ? x.group : null,
      },
    ];
  });

  return { name: typeof raw.name === "string" ? raw.name : "", matches };
}
