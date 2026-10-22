// @vitest-environment jsdom
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FavoritesSeed } from "@/components/favorites-seed";
import { EMPTY_FAVORITES, toFavoriteTeam, toggleLeague, toggleTeam, type Favorites } from "./favorites";
import { FAVORITES_COOKIE, decodeFavoritesCookie, encodeFavoritesCookie, favoritesCookieString } from "./favorites-cookie";
import { useFavorites } from "./use-favorites";

const team = (key: string) => toFavoriteTeam({ key, id: `espn:${key}`, name: key });
const withTeams = (...keys: string[]): Favorites => keys.reduceRight((f, k) => toggleTeam(f, team(k)), EMPTY_FAVORITES);

describe("cookie-espelho dos favoritos", () => {
  it("ida e volta: guarda só as chaves e os ids de liga", () => {
    const f = toggleLeague(withTeams("corinthians", "palmeiras"), "libertadores");
    const back = decodeFavoritesCookie(encodeFavoritesCookie(f));
    expect(back.teams.map((t) => t.key)).toEqual(["corinthians", "palmeiras"]);
    expect(back.leagues).toEqual(["libertadores"]);
  });

  it("os times lidos do cookie são 'magros' (sem id real): servem para ordenar, não para listar", () => {
    expect(decodeFavoritesCookie(encodeFavoritesCookie(withTeams("flamengo"))).teams[0]).toEqual({ key: "flamengo", id: "", name: "flamengo" });
  });

  it("o cookie nunca carrega nomes, escudos ou ids de partida", () => {
    const raw = decodeURIComponent(encodeFavoritesCookie(withTeams("corinthians")));
    expect(raw).toBe('{"t":["corinthians"],"l":[]}');
  });

  describe("não confia no que vem do navegador (o cookie é editável)", () => {
    it("ausente, vazio, lixo e JSON de outra forma → sem favoritos", () => {
      for (const raw of [undefined, null, "", "%E0%A4%A", "lixo", encodeURIComponent("[]"), encodeURIComponent("null"), encodeURIComponent("{}")]) {
        expect(decodeFavoritesCookie(raw), String(raw)).toBe(EMPTY_FAVORITES);
      }
    });

    it("descarta chaves inválidas, repetidas e gigantes, e ligas desconhecidas", () => {
      const raw = encodeURIComponent(JSON.stringify({ t: ["ok", "ok", "", 5, null, "x".repeat(200)], l: ["carioca", "inventada", 3, "carioca"] }));
      const f = decodeFavoritesCookie(raw);
      expect(f.teams.map((t) => t.key)).toEqual(["ok"]);
      expect(f.leagues).toEqual(["carioca"]);
    });

    it("limita a quantidade de times (o cookie não pode crescer sem fim)", () => {
      const many = Array.from({ length: 500 }, (_, i) => `time${i}`);
      expect(decodeFavoritesCookie(encodeURIComponent(JSON.stringify({ t: many, l: [] }))).teams).toHaveLength(60);
    });

    it("injeção no texto do cookie não vira nada além de chaves de texto", () => {
      const f = decodeFavoritesCookie(encodeURIComponent(JSON.stringify({ t: ["<script>alert(1)</script>"], l: [] })));
      expect(f.teams[0].key).toBe("<script>alert(1)</script>"); // é só texto: o React escapa na renderização
    });
  });

  it("o tamanho do cookie com o máximo de times fica bem abaixo do limite de 4 KB", () => {
    const f = withTeams(...Array.from({ length: 60 }, (_, i) => `um-time-com-nome-comprido-${i}`));
    expect(encodeFavoritesCookie(f).length).toBeLessThan(3000);
  });

  describe("texto do Set-Cookie", () => {
    it("com favoritos: um ano, SameSite=Lax, e Secure só em https", () => {
      const f = withTeams("corinthians");
      expect(favoritesCookieString(f, false)).toBe(`${FAVORITES_COOKIE}=${encodeFavoritesCookie(f)}; Path=/; Max-Age=31536000; SameSite=Lax`);
      expect(favoritesCookieString(f, true)).toMatch(/; Secure$/);
    });

    it("sem favoritos: apaga o cookie (Max-Age=0)", () => {
      expect(favoritesCookieString(EMPTY_FAVORITES, false)).toBe(`${FAVORITES_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
    });
  });
});

function Probe() {
  const { isTeam, isLeague } = useFavorites();
  return <p>{isTeam("corinthians") ? "time-favorito" : "time-comum"}/{isLeague("libertadores") ? "liga-favorita" : "liga-comum"}</p>;
}

describe("renderização no servidor com os favoritos do cookie (a 1ª pintura sai na ordem certa)", () => {
  it("o HTML do servidor já reflete os favoritos do cookie", () => {
    const seed = decodeFavoritesCookie(encodeFavoritesCookie(toggleLeague(withTeams("corinthians"), "libertadores")));
    const html = renderToString(
      <FavoritesSeed value={seed}>
        <Probe />
      </FavoritesSeed>,
    );
    expect(html).toContain("time-favorito");
    expect(html).toContain("liga-favorita");
  });

  it("sem cookie, o servidor renderiza sem favoritos", () => {
    const html = renderToString(<Probe />);
    expect(html).toContain("time-comum");
    expect(html).toContain("liga-comum");
  });
});
