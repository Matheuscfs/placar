import type { Metadata } from "next";
import { StateMessage } from "@/components/state-message";

export const metadata: Metadata = { title: "Sem conexão" };

// Página guardada pelo service worker: é o que aparece quando não há internet nem cópia da página pedida.
export default function OfflinePage() {
  return (
    <StateMessage title="Sem conexão" action={{ label: "Tentar de novo", href: "/" }}>
      Não foi possível abrir esta página sem internet. Os jogos que você já viu continuam disponíveis quando a conexão voltar.
    </StateMessage>
  );
}
