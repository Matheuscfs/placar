"use client";

import { usePush, type PushStatus } from "@/lib/ui/use-push";

const NOTES: Partial<Record<PushStatus, string>> = {
  unsupported: "Este navegador não oferece avisos.",
  "needs-install": "No iPhone e no iPad, instale o Placar na tela de início (Compartilhar → Adicionar à Tela de Início) para poder ativar os avisos.",
  denied: "Os avisos estão bloqueados neste navegador. Libere as notificações do site nas configurações do navegador e volte aqui.",
};

/**
 * Interruptor dos avisos de jogo dos times favoritos. Só aparece quando faz sentido: se o servidor não
 * tem os avisos ligados (sem chaves VAPID) ou ainda estamos descobrindo, não mostra nada.
 */
export function PushToggle({ teamKeys }: { teamKeys: string[] }) {
  const { status, busy, error, toggle } = usePush(teamKeys);
  if (status === "checking" || status === "unavailable") return null;

  const note = NOTES[status];
  const on = status === "on";
  return (
    <section className="mt-10" aria-labelledby="fav-avisos">
      <h2 id="fav-avisos" className="text-[1.35rem] font-bold">Avisos</h2>
      {note ? (
        <p className="mt-3 max-w-[46ch] text-muted">{note}</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p id="fav-avisos-label" className="font-semibold">Jogos dos seus times</p>
              <p id="fav-avisos-desc" className="mt-0.5 max-w-[42ch] text-sm text-muted">
                Começo, gols e fim de jogo, mesmo com o app fechado. {teamKeys.length === 0 ? "Favorite um time para receber." : null}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-busy={busy}
              aria-labelledby="fav-avisos-label"
              aria-describedby="fav-avisos-desc"
              disabled={busy}
              onClick={toggle}
              className="group grid h-11 w-14 shrink-0 place-items-center rounded-full disabled:opacity-60"
            >
              <span className={`relative h-7 w-12 rounded-full transition-colors ${on ? "bg-ink" : "bg-faint"}`}>
                <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-bg shadow-sm transition-transform motion-reduce:transition-none ${on ? "translate-x-5" : ""}`} />
              </span>
            </button>
          </div>
          <p className="mt-2 max-w-[46ch] text-xs text-muted">
            Para avisar, o servidor guarda o endereço de entrega deste aparelho e as chaves dos times favoritos. Sem conta, nome ou e-mail. Desligue a qualquer momento.
          </p>
        </>
      )}
      {error ? (
        <p role="alert" className="mt-3 max-w-[46ch] text-sm text-zone-down">
          {error}
        </p>
      ) : null}
    </section>
  );
}
