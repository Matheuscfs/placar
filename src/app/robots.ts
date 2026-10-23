import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// A API é só para o próprio app (e gasta cota das fontes): crawlers não precisam dela.
// Favoritos e "sem conexão" são páginas pessoais/utilitárias e saem do índice por `noindex` na própria página.
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.origin,
  };
}
