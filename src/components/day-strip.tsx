"use client";

import { useRef } from "react";
import type { IsoDate } from "@/lib/domain/types";
import { dateBounds, stripDays } from "@/lib/ui/days";
import { dayOfMonth, formatLongDay, formatWeekday } from "@/lib/ui/format";
import { CalendarIcon } from "./icons";

/**
 * Faixa de dias (3 antes e 3 depois da data escolhida) + calendário nativo para ir mais longe.
 * O dia escolhido é o único bloco preenchido da tela — âncora visual, sem cor.
 */
export function DayStrip({ selected, today, onSelect }: { selected: IsoDate; today: IsoDate; onSelect: (date: IsoDate) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const { min, max } = dateBounds(today);
  const days = stripDays(selected, today);

  const openCalendar = () => {
    const el = input.current;
    if (!el) return;
    if (typeof el.showPicker === "function") el.showPicker();
    else el.click();
  };

  return (
    <nav aria-label="Escolher o dia" className="mt-5 flex items-center gap-1">
      <ul className="no-scrollbar -mx-1 flex min-w-0 flex-1 items-center justify-between gap-0.5 overflow-x-auto px-1">
        {days.map((d) => (
          <li key={d.date} className={d.isEdge ? "hidden min-[420px]:block min-[768px]:hidden min-[1200px]:block" : undefined}>
            <button
              type="button"
              onClick={() => onSelect(d.date)}
              aria-current={d.isSelected ? "date" : undefined}
              aria-label={`${formatLongDay(d.date)}${d.isToday ? " (hoje)" : ""}`}
              className={`flex h-14 w-11 flex-col items-center justify-center rounded-2xl transition-colors sm:w-12 ${d.isSelected ? "bg-ink text-bg" : "text-ink hover:bg-surface"}`}
            >
              <span className={`text-xs ${d.isSelected ? "opacity-80" : "text-muted"}`}>{d.isToday ? "hoje" : formatWeekday(d.date)}</span>
              <span className="num mt-0.5 text-[1.05rem] font-bold leading-none">{dayOfMonth(d.date)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="relative">
        <button type="button" onClick={openCalendar} aria-label="Abrir o calendário" className="grid h-11 w-11 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink">
          <CalendarIcon />
        </button>
        {/* O campo de data nativo fica invisível: o botão acima abre o seletor do sistema (melhor teclado e leitor de tela que um calendário feito à mão). */}
        <input
          ref={input}
          type="date"
          min={min}
          max={max}
          value={selected}
          onChange={(e) => e.target.value && onSelect(e.target.value)}
          tabIndex={-1}
          aria-label="Data"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      </div>
    </nav>
  );
}
