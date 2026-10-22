import type { IsoDate } from "./types";

/** "Jogos do dia" são sempre no fuso do Brasil, onde está o público do app. */
export const APP_TIMEZONE = "America/Sao_Paulo";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): value is IsoDate {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Data de calendário (`YYYY-MM-DD`) de um instante no fuso informado. */
export function toZonedIsoDate(instant: Date | string, timeZone: string = APP_TIMEZONE): IsoDate {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) throw new RangeError(`Instante inválido: ${String(instant)}`);
  // "en-CA" formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Diferença (em minutos) entre o horário de parede em `timeZone` e UTC, no instante `utcMs`. */
function zoneOffsetMinutes(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.round((Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - utcMs) / 60_000);
}

/**
 * Horário de parede (`date` + `HH:MM`) em `timeZone` → instante UTC (`2026-10-24T22:30:00Z`).
 * Duas passadas para acertar horários perto da troca de horário de verão.
 */
export function zonedTimeToUtc(date: IsoDate, time: string, timeZone: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  // `Date.UTC` "rola" valores fora da faixa (mês 13 vira janeiro do ano seguinte): valida antes.
  if (!isIsoDate(date) || !/^\d{1,2}:\d{2}$/.test(time) || h > 23 || mi > 59) throw new RangeError(`Data/hora inválida: ${date} ${time}`);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const first = naive - zoneOffsetMinutes(naive, timeZone) * 60_000;
  const second = naive - zoneOffsetMinutes(first, timeZone) * 60_000;
  return new Date(second).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** `2026-10-19T23:00Z` → `2026-10-19T23:00:00Z` (sempre com segundos e sem milissegundos); inválido → `null`. */
export function toIsoUtc(value: string | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function addDays(date: IsoDate, days: number): IsoDate {
  if (!isIsoDate(date)) throw new RangeError(`Data inválida: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** O instante cai neste dia de calendário (no fuso do app)? */
export function isOnDate(instant: Date | string, date: IsoDate, timeZone: string = APP_TIMEZONE): boolean {
  return toZonedIsoDate(instant, timeZone) === date;
}

export function todayIso(now: Date = new Date(), timeZone: string = APP_TIMEZONE): IsoDate {
  return toZonedIsoDate(now, timeZone);
}
