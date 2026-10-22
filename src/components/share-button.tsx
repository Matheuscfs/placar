"use client";

import { useEffect, useState } from "react";
import { shareLink, type ShareOutcome } from "@/lib/ui/share";
import { ShareIcon } from "./icons";

const FEEDBACK: Partial<Record<ShareOutcome, string>> = { copied: "Link copiado", failed: "Não deu para compartilhar" };

/**
 * Compartilhar a página atual. No celular abre a folha do sistema; no computador copia o link e diz isso.
 * O aviso fica numa região `status` (anunciada por leitor de tela) e some sozinho.
 */
export function ShareButton({ title, text, className = "" }: { title: string; text: string; className?: string }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2500);
    return () => clearTimeout(t);
  }, [message]);

  const onClick = async () => {
    const outcome = await shareLink({ title, text, url: window.location.href });
    setMessage(FEEDBACK[outcome] ?? null);
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span role="status" className="text-sm text-muted">
        {message}
      </span>
      <button type="button" onClick={onClick} className="-mr-3 inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[0.95rem] font-medium text-muted transition-colors hover:bg-surface hover:text-ink">
        <ShareIcon width={18} height={18} />
        Compartilhar
      </button>
    </span>
  );
}
