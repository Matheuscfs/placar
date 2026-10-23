import type { Metadata } from "next";
import { FavoritesView } from "@/components/favorites-view";

// Página pessoal (os favoritos ficam neste aparelho): fora do índice dos buscadores.
export const metadata: Metadata = { title: "Favoritos", description: "Seus times e ligas favoritos, salvos neste aparelho.", robots: { index: false, follow: true } };

export default function FavoritesPage() {
  return <FavoritesView />;
}
