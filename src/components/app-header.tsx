import Link from "next/link";
import { SearchIconButton } from "./search-button";
import { ThemeToggle } from "./theme-toggle";
import { Wordmark } from "./wordmark";

/**
 * Cabeçalho do celular: só a marca e o tema. As seções ficam na barra inferior (TabBar) e, em telas
 * a partir de 768 px, no trilho lateral (AppRail), que substitui este cabeçalho.
 */
export function AppHeader() {
  return (
    <header className="mx-auto flex w-full max-w-[40rem] items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))] min-[768px]:hidden">
      <Link href="/" aria-label="Placar, página inicial" className="-m-2 p-2">
        <Wordmark />
      </Link>
      <div className="flex items-center gap-5">
        <SearchIconButton />
        <ThemeToggle />
      </div>
    </header>
  );
}
