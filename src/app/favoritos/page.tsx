import type { Metadata } from "next";
import { FavoritesView } from "@/components/favorites-view";

export const metadata: Metadata = { title: "Favoritos", description: "Seus times e ligas favoritos, salvos neste aparelho." };

export default function FavoritesPage() {
  return <FavoritesView />;
}
