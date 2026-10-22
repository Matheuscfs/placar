import Link from "next/link";
import { isEsportsConfigured } from "@/lib/esports/service";
import { ThemePicker } from "./theme-toggle";

export function AppFooter() {
  return (
    <footer className="mx-auto mt-16 w-full max-w-[40rem] px-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-sm text-muted min-[900px]:pb-10">
      <p className="max-w-[34ch]">
        Dados de ESPN, openfootball e football-data.org{isEsportsConfigured() ? "; e-sports por PandaScore" : ""}. Escudos, logos e nomes de competições pertencem aos seus titulares.
      </p>
      <Link href="/sobre" className="mt-2 inline-block font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
        Sobre o Placar
      </Link>
      <div>
        <ThemePicker />
      </div>
    </footer>
  );
}
