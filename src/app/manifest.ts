import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Placar — futebol ao vivo",
    short_name: "Placar",
    description: "Placares de futebol ao vivo, jogos do dia e classificação, sem ruído.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#12151c",
    theme_color: "#2b50ff",
    categories: ["sports", "news"],
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Jogos de hoje", short_name: "Hoje", url: "/" },
      { name: "Meus favoritos", short_name: "Favoritos", url: "/favoritos" },
    ],
  };
}
