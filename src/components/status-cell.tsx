import type { StatusView } from "@/lib/ui/format";

/**
 * Coluna de situação do jogo. O cobalto aparece SÓ aqui e só para jogo em andamento: é a cor que
 * diz "está acontecendo agora". Encerrado fica apagado; agendado mostra o horário em tinta normal.
 */
export function StatusCell({ status, align = "right" }: { status: StatusView; align?: "right" | "center" }) {
  const items = align === "center" ? "items-center text-center" : "items-end text-right";
  const live = status.kind === "live";
  const halftime = status.kind === "halftime";

  return (
    <span className={`flex flex-col gap-0.5 ${items}`}>
      {live || halftime ? (
        <span className="num flex items-center gap-1.5 font-semibold text-live">
          {live ? <span aria-hidden className="live-dot" /> : <span aria-hidden className="h-2 w-2 rounded-full bg-live opacity-60" />}
          {status.label}
        </span>
      ) : (
        <span className={`num font-medium ${status.kind === "scheduled" ? "text-ink" : "text-muted"}`}>{status.label}</span>
      )}
      {status.note ? <span className="text-xs text-muted">{status.note}</span> : null}
    </span>
  );
}
