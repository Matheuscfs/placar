"use client";

import { useRef, type KeyboardEvent } from "react";

export interface TabItem<Id extends string> {
  id: Id;
  label: string;
}

/**
 * Abas no padrão WAI-ARIA: setas esquerda/direita (e Home/End) movem o foco e trocam de aba; só a
 * aba ativa entra na ordem do Tab. O painel correspondente (role="tabpanel") fica com quem usa.
 * O ativo é sublinhado em tinta — sem cor.
 */
export function Tabs<Id extends string>({ tabs, value, onChange, label, idPrefix }: { tabs: TabItem<Id>[]; value: Id; onChange: (id: Id) => void; label: string; idPrefix: string }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (index === last ? 0 : index + 1) : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className="flex gap-6 border-b border-line">
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`-mb-px h-11 border-b-2 text-[0.98rem] font-semibold transition-colors ${active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export const panelProps = (idPrefix: string, id: string) => ({ role: "tabpanel" as const, id: `${idPrefix}-panel-${id}`, "aria-labelledby": `${idPrefix}-tab-${id}`, tabIndex: 0 });
