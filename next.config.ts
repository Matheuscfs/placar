import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O cache do Placar é feito por TTL na camada de dados (src/lib/data) e por
  // `Cache-Control` nas rotas /api — não pelo Cache Components do Next.
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
