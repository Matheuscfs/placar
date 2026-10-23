import type { MetadataRoute } from "next";
import { isEsportsConfigured } from "@/lib/esports/service";
import { siteUrl } from "@/lib/site";
import { PUBLIC_LEAGUES } from "@/lib/ui/leagues";

/**
 * Páginas estáveis: início, onde assistir, índice de tabelas, uma tabela por campeonato e o "sobre".
 * Jogos e times ficam de fora de propósito: nascem e somem a cada dia, e os crawlers chegam a eles pelos
 * links da própria tela inicial. E-sports só entra se este servidor tem a fonte configurada.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const at = (path: string, changeFrequency: "hourly" | "daily" | "weekly" | "monthly", priority: number) => ({ url: new URL(path, base).toString(), changeFrequency, priority });
  return [
    at("/", "hourly", 1),
    at("/onde-assistir", "daily", 0.8),
    at("/liga", "weekly", 0.7),
    ...(isEsportsConfigured() ? [at("/esports", "daily", 0.6)] : []),
    ...PUBLIC_LEAGUES.map((l) => at(`/liga/${l.id}`, "daily", 0.6)),
    at("/sobre", "monthly", 0.3),
  ];
}
