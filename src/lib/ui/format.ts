import { APP_TIMEZONE } from "@/lib/domain/dates";
import type { IsoDate, IsoDateTime, Match, SourceId } from "@/lib/domain/types";

/** Nome de cada fonte como aparece na tela. `Record<SourceId, …>`: ao criar uma fonte nova, o TypeScript obriga a nomeá-la aqui. */
export const SOURCE_NAMES: Record<SourceId, string> = { espn: "ESPN", "football-data": "football-data.org", openfootball: "openfootball" };

/** Tudo é formatado com fuso FIXO (Brasília), então servidor e navegador geram o mesmo texto (sem erro de hidratação). */
const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: APP_TIMEZONE });
const shortDate = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short", timeZone: APP_TIMEZONE });
// Datas de calendário (sem hora) são lidas ao meio-dia UTC, longe de qualquer virada de fuso.
const noon = (d: IsoDate) => new Date(`${d}T12:00:00Z`);
const longDay = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const weekdayShort = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" });

/** `20:00` */
export const formatTime = (iso: IsoDateTime) => time.format(new Date(iso));

/** `sáb 24 out` — curto o bastante para caber na coluna de situação do jogo sem quebrar. */
export function formatShortDate(iso: IsoDateTime): string {
  const part = (type: Intl.DateTimeFormatPartTypes) => shortDate.formatToParts(new Date(iso)).find((p) => p.type === type)?.value.replace(".", "") ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}

/** `quinta-feira, 22 de outubro` */
export const formatLongDay = (d: IsoDate) => longDay.format(noon(d));

const weekdayLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "UTC" });

/** `quinta-feira` */
export const formatWeekdayLong = (d: IsoDate) => weekdayLong.format(noon(d));

/** `22 de outubro` */
export const formatDayMonth = (d: IsoDate) => dayMonth.format(noon(d));

/** `qui` */
export const formatWeekday = (d: IsoDate) => weekdayShort.format(noon(d)).replace(".", "");

export const dayOfMonth = (d: IsoDate) => String(Number(d.slice(8, 10)));

/** "agora", "há 12 s", "há 3 min", "há 2 h". */
export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "agora";
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  return `há ${Math.floor(s / 3600)} h`;
}

export type StatusKind = "live" | "halftime" | "finished" | "scheduled" | "postponed" | "suspended" | "canceled";

export interface StatusView {
  kind: StatusKind;
  /** O que aparece na coluna de status: "67'", "Intervalo", "Fim", "20:00". */
  label: string;
  /** Linha de apoio: "2º tempo", "Pênaltis", "sáb., 24 out.". */
  note: string | null;
  /** Para leitores de tela. */
  spoken: string;
}

/** Como um jogo se apresenta na lista. `showDate` põe a data no jogo agendado (listas de vários dias). */
export function statusView(m: Pick<Match, "status" | "clock" | "statusText" | "kickoff">, opts: { showDate?: boolean } = {}): StatusView {
  switch (m.status) {
    case "live":
      return { kind: "live", label: m.clock ?? "Ao vivo", note: m.statusText && m.statusText !== "Ao vivo" ? m.statusText : null, spoken: `Ao vivo${m.clock ? `, ${m.clock}` : ""}${m.statusText ? `, ${m.statusText}` : ""}` };
    case "halftime":
      return { kind: "halftime", label: "Intervalo", note: null, spoken: "Intervalo" };
    case "finished": {
      const extra = m.statusText && m.statusText !== "Encerrado" ? m.statusText.replace(/^Encerrado \((.*)\)$/, "$1") : null;
      return { kind: "finished", label: "Fim", note: extra, spoken: `Encerrado${extra ? `, ${extra}` : ""}` };
    }
    case "postponed":
      return { kind: "postponed", label: "Adiado", note: null, spoken: "Adiado" };
    case "suspended":
      return { kind: "suspended", label: "Interrompido", note: null, spoken: "Interrompido" };
    case "canceled":
      return { kind: "canceled", label: "Cancelado", note: null, spoken: "Cancelado" };
    default: {
      const hour = formatTime(m.kickoff);
      return { kind: "scheduled", label: hour, note: opts.showDate ? formatShortDate(m.kickoff) : null, spoken: `${opts.showDate ? `${formatShortDate(m.kickoff)}, ` : ""}às ${hour}` };
    }
  }
}

/** Quem venceu o jogo (para suavizar o perdedor). `null` = empate, sem placar ou ainda não decidido. */
export function winnerOf(m: Pick<Match, "status" | "home" | "away">): "home" | "away" | null {
  if (m.status !== "finished") return null;
  const { home, away } = m;
  if (home.score === null || away.score === null) return null;
  if (home.score !== away.score) return home.score > away.score ? "home" : "away";
  if (home.penalties !== null && away.penalties !== null && home.penalties !== away.penalties) return home.penalties > away.penalties ? "home" : "away";
  return null;
}

/** O jogo já tem placar para mostrar? (agendado/adiado/cancelado não têm.) */
export const hasScore = (m: Pick<Match, "status" | "home" | "away">) => m.status !== "scheduled" && m.status !== "postponed" && m.status !== "canceled" && m.home.score !== null && m.away.score !== null;

/** "Corinthians 1 x 1 Vitória, encerrado" — resumo falado do cartão de jogo. */
export function matchSummary(m: Match): string {
  const s = statusView(m);
  const score = hasScore(m) ? `${m.home.team.name} ${m.home.score} x ${m.away.score} ${m.away.team.name}` : `${m.home.team.name} contra ${m.away.team.name}`;
  return `${score}, ${s.spoken}`;
}
