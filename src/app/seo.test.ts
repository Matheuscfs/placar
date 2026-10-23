import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "@/lib/site";
import { PUBLIC_LEAGUES } from "@/lib/ui/leagues";
import robots from "./robots";
import sitemap from "./sitemap";

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl", () => {
  it("usa SITE_URL quando definido (o domínio próprio)", () => {
    expect(siteUrl({ SITE_URL: "https://meusite.com.br", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" }).origin).toBe("https://meusite.com.br");
  });
  it("sem SITE_URL, usa o domínio de produção que a Vercel informa", () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "placar-orpin-five.vercel.app" }).origin).toBe("https://placar-orpin-five.vercel.app");
  });
  it("SITE_URL inválido é ignorado; sem nada, cai no localhost", () => {
    expect(siteUrl({ SITE_URL: "isso não é url", VERCEL_PROJECT_PRODUCTION_URL: "a.vercel.app" }).origin).toBe("https://a.vercel.app");
    expect(siteUrl({}).origin).toBe("http://localhost:3000");
  });
  it("compilação de produção sem variável nenhuma não escreve localhost nos links canônicos", () => {
    expect(siteUrl({ NODE_ENV: "production" }).origin).toBe("https://placar-orpin-five.vercel.app");
  });
});

describe("robots.txt", () => {
  it("libera o site, bloqueia só a API e aponta o sitemap", () => {
    vi.stubEnv("SITE_URL", "https://meusite.com.br");
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/api/"] });
    expect(r.sitemap).toBe("https://meusite.com.br/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  it("lista as páginas estáveis e uma tabela por campeonato, com endereços absolutos", () => {
    vi.stubEnv("SITE_URL", "https://meusite.com.br");
    vi.stubEnv("PANDASCORE_TOKEN", "");
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://meusite.com.br/");
    expect(urls).toContain("https://meusite.com.br/onde-assistir");
    expect(urls).toContain("https://meusite.com.br/liga");
    expect(urls).toContain("https://meusite.com.br/sobre");
    for (const l of PUBLIC_LEAGUES) expect(urls).toContain(`https://meusite.com.br/liga/${l.id}`);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("não inclui favoritos, offline, API nem jogos; e-sports só com a fonte configurada", () => {
    vi.stubEnv("SITE_URL", "https://meusite.com.br");
    vi.stubEnv("PANDASCORE_TOKEN", "");
    expect(sitemap().map((e) => e.url).some((u) => /favoritos|offline|\/api|\/jogo\/|esports/.test(u))).toBe(false);
    vi.stubEnv("PANDASCORE_TOKEN", "t");
    expect(sitemap().map((e) => e.url)).toContain("https://meusite.com.br/esports");
  });
});
