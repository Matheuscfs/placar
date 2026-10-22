const ESPN_CREST = /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/(.+\.png)$/;

/**
 * Escudo no tamanho certo. Os escudos da ESPN vêm em 500 px (~125 KB); o "combiner" da própria ESPN
 * entrega o mesmo escudo redimensionado (~9 KB em 96 px). `size` é o tamanho exibido em px; pedimos o
 * dobro para telas retina. Outras origens (football-data) passam como estão.
 */
export function crestUrl(logo: string | undefined, size: number): string | undefined {
  if (!logo) return undefined;
  const m = ESPN_CREST.exec(logo);
  if (!m) return logo;
  const px = Math.round(size * 2);
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/${m[1]}&w=${px}&h=${px}`;
}

/** Iniciais para o escudo que não carregou (ou que a fonte não tem): "SP", "FLA". */
export function monogram(name: string, abbr?: string): string {
  const letters = (abbr?.trim() || name).normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^A-Za-z]/g, "");
  return letters.slice(0, 3).toUpperCase() || "?";
}
