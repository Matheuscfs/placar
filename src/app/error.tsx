"use client";

import { StateMessage } from "@/components/state-message";

// Último recurso: um erro inesperado na tela. Os erros de dados (fonte fora do ar) têm tratamento próprio em cada página.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StateMessage tone="error" title="Algo deu errado" action={{ label: "Tentar de novo", onClick: reset }}>
      Não foi possível mostrar esta tela. Tente de novo; se continuar, volte para a tela inicial.
    </StateMessage>
  );
}
