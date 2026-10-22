import type { OfMatch, OfScore, OfSeason, Pair } from "./of-types";

/**
 * Parser do formato Football.TXT do openfootball (repositório `south-america`).
 *
 *   = Copa Libertadores 2026
 *   ▪ Group, Matchday 1
 *     Tue Apr 14 2026
 *       19:00  Estudiantes (ARG)   v Cusco FC (PER)      2-1 (1-1)
 *              Club Nacional (URU) v CD Tolima (COL)     3-1 (0-0)      ← sem hora: repete a anterior
 *
 * Placar (todas as variantes observadas nos arquivos reais):
 *   2-1                          tempo regulamentar
 *   2-1 (0-0)                    + 1º tempo
 *   1-2 a.e.t. (1-1, 0-1)        após prorrogação, (regulamentar, 1º tempo)
 *   5-3 pen. (1-0, 1-0)          pênaltis, (regulamentar, 1º tempo)
 *   1-4 pen. 1-4 a.e.t. (1-1, 0-0)
 *
 * Linhas com times `N.N.` (a definir) são ignoradas.
 */

const MONTHS: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

const DATE_LINE = /^\s{1,4}(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{4}))?\s*$/;
const ROUND_LINE = /^▪\s*(.+?)\s*$/;
const TITLE_LINE = /^=\s*(.+?)\s*$/;
const MATCH_LINE = /^\s+(?:(\d{1,2}:\d{2})\s+)?(\S.*?)\s+v\s+(\S.*?)\s*$/;
const SCORE_TAIL = /^(.*?)\s+(\d+-\d+(?:\s+(?:pen|a\.e\.t)\.)?(?:\s+\d+-\d+\s+(?:pen|a\.e\.t)\.)?(?:\s*\([^)]*\))?)$/;

const pair = (a: string, b: string): Pair => [Number(a), Number(b)];

/** `"5-3 pen. (1-0, 1-0)"` → `{ p: [5,3], ft: [1,0], ht: [1,0] }`. */
export function parseScoreTail(tail: string): OfScore {
  const paren = /\(([^)]*)\)\s*$/.exec(tail);
  const inside = paren
    ? paren[1]
        .split(",")
        .map((s) => /(\d+)-(\d+)/.exec(s))
        .flatMap((m) => (m ? [pair(m[1], m[2])] : []))
    : [];
  const head = paren ? tail.slice(0, paren.index) : tail;

  const score: OfScore = {};
  let plain: Pair | undefined;
  for (const m of head.matchAll(/(\d+)-(\d+)(?:\s+(pen|a\.e\.t)\.)?/g)) {
    const p = pair(m[1], m[2]);
    if (m[3] === "pen") score.p = p;
    else if (m[3] === "a.e.t") score.et = p;
    else plain ??= p;
  }

  if (score.p || score.et) {
    // Com pênaltis/prorrogação, o parêntese é (regulamentar, 1º tempo); um valor só é o regulamentar.
    if (inside[0]) score.ft = inside[0];
    if (inside[1]) score.ht = inside[1];
  } else {
    if (plain) score.ft = plain;
    if (inside[0]) score.ht = inside[0];
  }
  return score;
}

export function parseFootballTxt(text: string, defaultYear: number): OfSeason {
  let name = "";
  let round = "";
  let group: string | null = null;
  let year = defaultYear;
  let lastMonth = 0;
  let date: string | null = null;
  let time: string | null = null;
  const matches: OfMatch[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const title = TITLE_LINE.exec(line);
    if (title && !name) {
      name = title[1];
      continue;
    }

    const r = ROUND_LINE.exec(line);
    if (r) {
      round = r[1];
      group = /^Group ([A-Z])$/.exec(round)?.[1] ?? null;
      date = null;
      time = null;
      continue;
    }

    const d = DATE_LINE.exec(line);
    if (d) {
      const month = MONTHS[d[1]];
      if (!month) continue;
      if (d[3]) year = Number(d[3]);
      else if (month < lastMonth) year += 1; // virou o ano (ex.: dez → jan)
      lastMonth = month;
      date = `${year}-${String(month).padStart(2, "0")}-${String(Number(d[2])).padStart(2, "0")}`;
      time = null;
      continue;
    }

    const m = MATCH_LINE.exec(line);
    if (!m || !date) continue;
    if (m[1]) time = m[1];

    const team1 = m[2].trim();
    let team2 = m[3].trim();
    let score: OfScore | null = null;
    const tail = SCORE_TAIL.exec(team2);
    if (tail) {
      team2 = tail[1].trim();
      score = parseScoreTail(tail[2]);
    }
    if (/^N\.N\.?$/.test(team1) || /^N\.N\.?$/.test(team2)) continue; // time ainda indefinido

    matches.push({ round, date, time, team1, team2, score, group });
  }

  return { name, matches };
}
