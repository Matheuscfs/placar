import { toZonedIsoDate } from "@/lib/domain/dates";
import type { FormGame, MatchDetail, MeetingGame } from "@/lib/domain/types";
import { formatTime } from "./format";

/** Textos e contas da página do jogo, sem JSX (testáveis). Funcionam no servidor (título, descrição) e no navegador. */

/** `2026-10-22` → `22/10/2026`. */
const dayMonthYear = (iso: string): string => {
  const d = toZonedIsoDate(iso);
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
};

/** `21:30` → `21h30`; hora cheia → `21h`. */
const clockText = (iso: string): string => {
  const [h, m] = formatTime(iso).split(":");
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`;
};

/**
 * Parágrafo "Sobre a partida": o que o torcedor (e o Google, e quem recebe o link) quer saber de uma vez, só com o que
 * a fonte informou. Evita artigos ("o", "a", "no") antes de nomes, porque o gênero muda de time para time.
 */
export function matchAbout(m: MatchDetail, leagueName: string | null): string {
  const home = m.home.team.name;
  const away = m.away.team.name;
  const date = dayMonthYear(m.kickoff);
  const valid = leagueName ? `, em partida válida por ${leagueName}${m.round ? ` (${m.round})` : ""}` : m.round ? `, em partida válida pela fase ${m.round}` : "";
  const where = m.venue ? `, em ${m.venue}` : "";
  const ref = m.referee ? ` Arbitragem: ${m.referee}.` : "";
  const score = m.home.score !== null && m.away.score !== null ? `${home} ${m.home.score} x ${m.away.score} ${away}` : null;

  switch (m.status) {
    case "scheduled":
      return `${home} e ${away} se enfrentam em ${date}, às ${clockText(m.kickoff)} (horário de Brasília)${where}${valid}.${ref}`;
    case "live":
    case "halftime":
      return `${home} e ${away} jogam agora${where}${valid}.${score ? ` Placar: ${score}.` : ""}${ref}`;
    case "finished": {
      const pens = m.home.penalties !== null && m.away.penalties !== null ? ` Nos pênaltis: ${m.home.penalties} x ${m.away.penalties}.` : "";
      return score ? `Terminou ${score} em ${date}${where}${valid}.${pens}${ref}` : `${home} e ${away} jogaram em ${date}${where}${valid}.${ref}`;
    }
    case "postponed":
      return `A partida entre ${home} e ${away}${valid.replace(", em partida válida", ", válida")}, marcada para ${date}, foi adiada.`;
    case "suspended":
      return `A partida entre ${home} e ${away}${valid.replace(", em partida válida", ", válida")} foi suspensa.`;
    case "canceled":
      return `A partida entre ${home} e ${away}${valid.replace(", em partida válida", ", válida")}, que seria em ${date}, foi cancelada.`;
  }
}

/** Título que diz o que a pessoa vai encontrar (e o que ela provavelmente buscou no Google). */
export function matchTitle(m: Pick<MatchDetail, "status" | "home" | "away">): string {
  const home = m.home.team.name;
  const away = m.away.team.name;
  if (m.status === "finished" && m.home.score !== null && m.away.score !== null) return `${home} ${m.home.score} x ${m.away.score} ${away}: resultado, gols e estatísticas`;
  if (m.status === "live" || m.status === "halftime") return `${home} x ${away} ao vivo: placar, lances e escalações`;
  return `${home} x ${away}: onde assistir, horário e escalações`;
}

/**
 * "Começa em 3 h 45 min". `ms` é o tempo que falta. Antes de 1 min: "Começa em instantes". Passou da hora e a fonte
 * ainda diz "não começou" (atraso): `null`, e quem chama mostra o status normal em vez de uma contagem que não existe.
 */
export function formatCountdown(ms: number): string | null {
  if (ms <= 0) return null;
  const min = Math.ceil(ms / 60_000);
  if (min <= 1) return "Começa em instantes";
  if (min < 60) return `Começa em ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) {
    const rest = min % 60;
    return rest === 0 ? `Começa em ${hours} h` : `Começa em ${hours} h ${rest} min`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "Começa em 1 dia" : `Começa em ${days} dias`;
}

export interface HeadToHeadRecord {
  homeWins: number;
  draws: number;
  awayWins: number;
}

/**
 * Saldo dos confrontos listados, do ponto de vista dos dois times da partida de agora (o mandante de agora pode ter
 * sido visitante antes). Conta só o placar do jogo: pênaltis não mudam o empate. Calculado dos jogos EXIBIDOS, para a
 * conta nunca contradizer a lista.
 */
export function headToHeadRecord(games: readonly MeetingGame[], homeTeamId: string, awayTeamId: string): HeadToHeadRecord {
  const r: HeadToHeadRecord = { homeWins: 0, draws: 0, awayWins: 0 };
  for (const g of games) {
    const mine = g.home.teamId === homeTeamId ? g.home : g.away.teamId === homeTeamId ? g.away : null;
    const theirs = g.home.teamId === awayTeamId ? g.home : g.away.teamId === awayTeamId ? g.away : null;
    if (!mine || !theirs || mine === theirs) continue;
    if (mine.score > theirs.score) r.homeWins++;
    else if (mine.score < theirs.score) r.awayWins++;
    else r.draws++;
  }
  return r;
}

export const RESULT_LETTER: Record<FormGame["result"], string> = { win: "V", draw: "E", loss: "D" };
export const RESULT_WORD: Record<FormGame["result"], string> = { win: "vitória", draw: "empate", loss: "derrota" };

/** Resumo falado de uma sequência: "3 vitórias, 2 empates, nenhuma derrota". */
export function formSummary(games: readonly FormGame[]): string {
  const n = (r: FormGame["result"]) => games.filter((g) => g.result === r).length;
  // "nenhuma vitória / nenhum empate / nenhuma derrota": o gênero muda de uma palavra para outra.
  const part = (count: number, none: string, one: string, many: string) => (count === 0 ? none : count === 1 ? `1 ${one}` : `${count} ${many}`);
  return [part(n("win"), "nenhuma vitória", "vitória", "vitórias"), part(n("draw"), "nenhum empate", "empate", "empates"), part(n("loss"), "nenhuma derrota", "derrota", "derrotas")].join(", ");
}
