import Link from "next/link";
import { StarIcon } from "./icons";

/** Marca: o nome em largura expandida e o ponto cobalto, o mesmo ponto que pulsa nos jogos ao vivo. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark inline-flex items-baseline text-[1.35rem] ${className}`}>
      placar
      <span aria-hidden className="ml-0.5 inline-block h-[0.42em] w-[0.42em] rounded-full bg-live" />
    </span>
  );
}

export function AppHeader() {
  return (
    <header className="mx-auto flex w-full max-w-[40rem] items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link href="/" aria-label="Placar, página inicial" className="-m-2 p-2">
        <Wordmark />
      </Link>
      <Link href="/favoritos" className="-m-2 flex items-center gap-1.5 p-2 text-[0.95rem] font-medium text-muted hover:text-ink">
        <StarIcon />
        Favoritos
      </Link>
    </header>
  );
}
