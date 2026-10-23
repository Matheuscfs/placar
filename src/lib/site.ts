export const SITE_NAME = "Placar";
export const SITE_TAGLINE = "Placares de futebol ao vivo, jogos do dia e classificação, sem ruído.";

/**
 * Endereço público do site: base dos links absolutos (canonical, compartilhamento, sitemap).
 * Ordem: `SITE_URL` (o domínio próprio, quando houver) → domínio de produção que a Vercel informa → localhost.
 * Ao trocar para um domínio próprio, basta definir `SITE_URL` (ex.: https://meusite.com.br) e publicar de novo.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): URL {
  const explicit = env.SITE_URL?.trim();
  if (explicit) {
    try {
      return new URL(explicit);
    } catch {
      /* valor inválido: cai para o próximo */
    }
  }
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return new URL(`https://${vercel}`);
  // Páginas estáticas (robots, sitemap, /sobre) são geradas na compilação. Numa compilação de produção sem nenhuma das
  // variáveis acima, um endereço de localhost iria para os links canônicos: melhor o endereço atual de produção.
  return new URL(env.NODE_ENV === "production" ? PRODUCTION_FALLBACK : "http://localhost:3000");
}

const PRODUCTION_FALLBACK = "https://placar-orpin-five.vercel.app";
