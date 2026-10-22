import type { Match } from "@/lib/domain/types";

/** Texto curto para compartilhar um jogo: "Corinthians 2 x 1 Vitória" (com placar) ou "Corinthians x Vitória". */
export function matchShareText(m: Pick<Match, "home" | "away">): string {
  const h = m.home;
  const a = m.away;
  return h.score !== null && a.score !== null ? `${h.team.name} ${h.score} x ${a.score} ${a.team.name}` : `${h.team.name} x ${a.team.name}`;
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

interface ShareEnv {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  writeText?: (text: string) => Promise<void>;
}

/**
 * Compartilha o link: usa a folha de compartilhamento do aparelho quando existe (celulares), senão copia o
 * link. Quem fecha a folha sem escolher nada NÃO é erro ("cancelled"). Recebe o ambiente por parâmetro para
 * os testes não dependerem do navegador.
 */
export async function shareLink(data: { title: string; text: string; url: string }, env: ShareEnv = defaultEnv()): Promise<ShareOutcome> {
  if (env.share && (!env.canShare || env.canShare(data))) {
    try {
      await env.share(data);
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // Falhou por outro motivo (ex.: permissão): tenta copiar em vez de desistir.
    }
  }
  if (env.writeText) {
    try {
      await env.writeText(data.url);
      return "copied";
    } catch {
      return "failed";
    }
  }
  return "failed";
}

/**
 * Plano B para copiar: a API moderna da área de transferência exige contexto seguro e permissão, e alguns
 * navegadores a recusam. O método antigo (`execCommand`) funciona num clique do usuário mesmo assim.
 */
export function legacyCopy(text: string): void {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") throw new Error("copiar não é possível aqui");
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    if (!document.execCommand("copy")) throw new Error("o navegador recusou copiar");
  } finally {
    area.remove();
  }
}

function defaultEnv(): ShareEnv {
  if (typeof navigator === "undefined") return {};
  return {
    share: typeof navigator.share === "function" ? (d) => navigator.share(d) : undefined,
    canShare: typeof navigator.canShare === "function" ? (d) => navigator.canShare(d) : undefined,
    writeText: async (t) => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("sem API de área de transferência");
        await navigator.clipboard.writeText(t);
      } catch {
        legacyCopy(t);
      }
    },
  };
}
