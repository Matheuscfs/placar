import { DATE_WINDOW_DAYS } from "@/lib/config";
import { addDays, isIsoDate } from "@/lib/domain/dates";
import type { IsoDate } from "@/lib/domain/types";

/** Menor e maior data que a API aceita (ver `parseDateParam`). */
export function dateBounds(today: IsoDate): { min: IsoDate; max: IsoDate } {
  return { min: addDays(today, -DATE_WINDOW_DAYS.past), max: addDays(today, DATE_WINDOW_DAYS.future) };
}

/** A data é válida e está dentro da janela da API? Usada para ler `?d=` da URL. */
export function isAllowedDate(value: string | null | undefined, today: IsoDate): value is IsoDate {
  if (!value || !isIsoDate(value)) return false;
  const { min, max } = dateBounds(today);
  return value >= min && value <= max;
}

export interface StripDay {
  date: IsoDate;
  isToday: boolean;
  isSelected: boolean;
  /** Os dois dias das pontas: em telas estreitas a faixa mostra só 5 dias e esconde estes. */
  isEdge: boolean;
}

/** Os dias da faixa: `span` antes e depois da data escolhida, sem sair da janela aceita. */
export function stripDays(selected: IsoDate, today: IsoDate, span = 3): StripDay[] {
  const { min, max } = dateBounds(today);
  const days: StripDay[] = [];
  for (let i = -span; i <= span; i++) {
    const date = addDays(selected, i);
    if (date < min || date > max) continue;
    days.push({ date, isToday: date === today, isSelected: date === selected, isEdge: Math.abs(i) === span && span > 2 });
  }
  return days;
}
