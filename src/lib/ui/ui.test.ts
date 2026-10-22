import { describe, expect, it } from "vitest";
import type { Match, MatchStatus, Team } from "@/lib/domain/types";
import { crestUrl, monogram } from "./crest";
import { EMPTY_FAVORITES, isFavoriteLeague, isFavoriteTeam, parseFavorites, serializeFavorites, toFavoriteTeam, toggleLeague, toggleTeam, type Favorites } from "./favorites";
import { dayOfMonth, formatAge, formatLongDay, formatShortDate, formatTime, formatWeekday, hasScore, matchSummary, statusView, winnerOf } from "./format";
import { PUBLIC_LEAGUES, groupMatches, hasLive, involvesFavorite, leagueById } from "./leagues";
import { MAX_REFRESH_MS, MIN_REFRESH_MS, nextRefreshMs } from "./refresh";

const team = (key: string, over: Partial<Team> = {}): Team => ({ id: `espn:${key}`, key, name: key[0].toUpperCase() + key.slice(1), shortName: key, abbr: key.slice(0, 3).toUpperCase(), ...over });

function match(n: number, over: Omit<Partial<Match>, "home" | "away"> & { home?: Partial<Match["home"]>; away?: Partial<Match["away"]> } = {}): Match {
  const { home, away, ...rest } = over;
  return {
    id: `espn:bra.1:${n}`,
    source: "espn",
    leagueId: "brasileirao-a",
    season: "2026",
    round: null,
    kickoff: "2026-10-24T19:30:00Z",
    status: "scheduled",
    statusText: null,
    clock: null,
    home: { team: team(`casa${n}`), score: null, penalties: null, aggregate: null, ...home },
    away: { team: team(`fora${n}`), score: null, penalties: null, aggregate: null, ...away },
    venue: null,
    ...rest,
  };
}

describe("formatação (sempre em Brasília, igual no servidor e no navegador)", () => {
  it("hora do jogo", () => {
    expect(formatTime("2026-10-23T00:30:00Z")).toBe("21:30");
    expect(formatTime("2026-10-24T19:30:00Z")).toBe("16:30");
    expect(formatTime("2026-10-24T03:00:00Z")).toBe("00:00"); // meia-noite é 00:00, nunca 24:00
  });

  it("dia por extenso e dia da semana", () => {
    expect(formatLongDay("2026-10-22")).toBe("quinta-feira, 22 de outubro");
    expect(formatWeekday("2026-10-22")).toBe("qui");
    expect(formatWeekday("2026-10-24")).toBe("sáb");
    expect(dayOfMonth("2026-10-05")).toBe("5");
  });

  it("não escorrega de dia perto da virada (datas de calendário são lidas ao meio-dia UTC)", () => {
    expect(formatLongDay("2026-01-01")).toBe("quinta-feira, 1 de janeiro");
    expect(formatLongDay("2026-12-31")).toBe("quinta-feira, 31 de dezembro");
  });

  it("data curta de um instante usa o dia de Brasília, sem pontos nem 'de' (cabe sem quebrar)", () => {
    expect(formatShortDate("2026-10-24T01:00:00Z")).toBe("sex 23 out"); // 22:00 de 23/10 em Brasília
    expect(formatShortDate("2026-11-04T23:30:00Z")).toBe("qua 4 nov");
  });

  it("idade do dado", () => {
    expect(formatAge(2_000)).toBe("agora");
    expect(formatAge(12_000)).toBe("há 12 s");
    expect(formatAge(180_000)).toBe("há 3 min");
    expect(formatAge(7_200_000)).toBe("há 2 h");
    expect(formatAge(-500)).toBe("agora");
  });
});

describe("como um jogo se apresenta", () => {
  const view = (status: MatchStatus, over: Partial<Match> = {}, opts?: { showDate?: boolean }) => statusView({ status, clock: null, statusText: null, kickoff: "2026-10-24T19:30:00Z", ...over }, opts);

  it("agendado mostra a hora; em listas de vários dias, também a data", () => {
    expect(view("scheduled")).toMatchObject({ kind: "scheduled", label: "16:30", note: null });
    expect(view("scheduled", {}, { showDate: true }).note).toContain("24");
    expect(view("scheduled").spoken).toBe("às 16:30");
  });

  it("ao vivo mostra o relógio e, abaixo, o tempo", () => {
    expect(view("live", { clock: "67'", statusText: "2º tempo" })).toMatchObject({ kind: "live", label: "67'", note: "2º tempo" });
    expect(view("live", { clock: null, statusText: "Ao vivo" })).toMatchObject({ label: "Ao vivo", note: null }); // sem repetir a palavra
    expect(view("live", { clock: "67'", statusText: "2º tempo" }).spoken).toBe("Ao vivo, 67', 2º tempo");
  });

  it("intervalo, adiado, interrompido e cancelado", () => {
    expect(view("halftime")).toMatchObject({ kind: "halftime", label: "Intervalo" });
    expect(view("postponed").label).toBe("Adiado");
    expect(view("suspended").label).toBe("Interrompido");
    expect(view("canceled").label).toBe("Cancelado");
  });

  it("encerrado: 'Fim', com pênaltis ou prorrogação como apoio", () => {
    expect(view("finished", { statusText: "Encerrado" })).toMatchObject({ label: "Fim", note: null });
    expect(view("finished", { statusText: "Encerrado (pênaltis)" })).toMatchObject({ label: "Fim", note: "pênaltis" });
    expect(view("finished", { statusText: "Encerrado (prorrogação)" }).note).toBe("prorrogação");
    expect(view("finished", { statusText: "Encerrado (W.O.)" }).note).toBe("W.O.");
  });
});

describe("placar", () => {
  const done = (hs: number, as: number, pens?: [number, number]) =>
    match(1, { status: "finished", home: { score: hs, penalties: pens?.[0] ?? null }, away: { score: as, penalties: pens?.[1] ?? null } });

  it("vencedor: o outro lado é suavizado na tela", () => {
    expect(winnerOf(done(2, 1))).toBe("home");
    expect(winnerOf(done(0, 3))).toBe("away");
  });

  it("empate não tem vencedor; nos pênaltis, quem ganhou é o vencedor", () => {
    expect(winnerOf(done(1, 1))).toBeNull();
    expect(winnerOf(done(1, 1, [3, 5]))).toBe("away");
    expect(winnerOf(done(1, 1, [4, 2]))).toBe("home");
  });

  it("jogo em andamento ou sem placar não tem vencedor", () => {
    expect(winnerOf(match(1, { status: "live", home: { score: 2 }, away: { score: 0 } }))).toBeNull();
    expect(winnerOf(match(1))).toBeNull();
    expect(winnerOf(match(1, { status: "finished" }))).toBeNull();
  });

  it("só mostra placar quando o jogo começou e há números", () => {
    expect(hasScore(match(1))).toBe(false);
    expect(hasScore(match(1, { status: "postponed", home: { score: 0 }, away: { score: 0 } }))).toBe(false);
    expect(hasScore(match(1, { status: "live", home: { score: 0 }, away: { score: 0 } }))).toBe(true);
    expect(hasScore(match(1, { status: "live", home: { score: 0 } }))).toBe(false);
  });

  it("resumo falado do cartão", () => {
    expect(matchSummary(done(1, 1))).toBe("Casa1 1 x 1 Fora1, Encerrado");
    expect(matchSummary(match(1))).toBe("Casa1 contra Fora1, às 16:30");
  });
});

describe("escudos", () => {
  it("escudo da ESPN vem redimensionado (dobro do tamanho, para telas retina)", () => {
    expect(crestUrl("https://a.espncdn.com/i/teamlogos/soccer/500/874.png", 40)).toBe("https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/874.png&w=80&h=80");
  });

  it("outras origens e ausência passam como estão", () => {
    expect(crestUrl("https://crests.football-data.org/1779.png", 40)).toBe("https://crests.football-data.org/1779.png");
    expect(crestUrl(undefined, 40)).toBeUndefined();
    expect(crestUrl("", 40)).toBeUndefined();
  });

  it("iniciais para quando não há escudo", () => {
    expect(monogram("São Paulo", "SAO")).toBe("SAO");
    expect(monogram("Grêmio")).toBe("GRE");
    expect(monogram("1. FC Köln")).toBe("FCK");
    expect(monogram("")).toBe("?");
  });
});

describe("favoritos", () => {
  const cor = toFavoriteTeam(team("corinthians", { logo: "https://x/874.png" }));
  const pal = toFavoriteTeam(team("palmeiras"));

  it("o time é guardado pela chave estável, com o que é preciso para listá-lo", () => {
    expect(cor).toEqual({ key: "corinthians", id: "espn:corinthians", name: "Corinthians", logo: "https://x/874.png" });
    expect(pal).not.toHaveProperty("logo");
  });

  it("liga e desliga time; o mais novo vai para o começo", () => {
    let f: Favorites = EMPTY_FAVORITES;
    f = toggleTeam(f, cor);
    f = toggleTeam(f, pal);
    expect(f.teams.map((t) => t.key)).toEqual(["palmeiras", "corinthians"]);
    expect(isFavoriteTeam(f, "corinthians")).toBe(true);
    f = toggleTeam(f, cor);
    expect(isFavoriteTeam(f, "corinthians")).toBe(false);
    expect(f.teams).toHaveLength(1);
  });

  it("liga e desliga liga", () => {
    let f = toggleLeague(EMPTY_FAVORITES, "libertadores");
    expect(isFavoriteLeague(f, "libertadores")).toBe(true);
    f = toggleLeague(f, "libertadores");
    expect(f.leagues).toEqual([]);
  });

  it("não altera o objeto original (a referência muda só quando o conteúdo muda)", () => {
    const f = toggleTeam(EMPTY_FAVORITES, cor);
    expect(EMPTY_FAVORITES.teams).toHaveLength(0);
    expect(f).not.toBe(EMPTY_FAVORITES);
  });

  it("ida e volta pelo texto salvo", () => {
    const f = toggleLeague(toggleTeam(toggleTeam(EMPTY_FAVORITES, cor), pal), "brasileirao-a");
    expect(parseFavorites(serializeFavorites(f))).toEqual(f);
  });

  describe("lê o que está salvo sem confiar nele", () => {
    it("nada, lixo e JSON de outra forma → vazio", () => {
      for (const raw of [null, "", "não é json", "[]", "null", "42", '"texto"', "{}"]) expect(parseFavorites(raw), String(raw)).toBe(EMPTY_FAVORITES);
    });

    it("descarta times malformados e repetidos, e ligas desconhecidas", () => {
      const raw = JSON.stringify({
        teams: [{ key: "a", id: "espn:1", name: "A" }, { key: "a", id: "espn:1", name: "A de novo" }, { key: "", id: "x", name: "vazio" }, { key: "b" }, null, "texto", { key: "c", id: "espn:3", name: "C", logo: 5 }],
        leagues: ["libertadores", "inventada", 7, "libertadores", "carioca"],
      });
      const f = parseFavorites(raw);
      expect(f.teams.map((t) => t.key)).toEqual(["a"]);
      expect(f.leagues).toEqual(["libertadores", "carioca"]);
    });

    it("campos ausentes viram listas vazias", () => {
      expect(parseFavorites(JSON.stringify({ leagues: ["carioca"] }))).toEqual({ teams: [], leagues: ["carioca"] });
      expect(parseFavorites(JSON.stringify({ teams: "não é lista", leagues: {} }))).toBe(EMPTY_FAVORITES);
    });
  });
});

describe("agrupamento da tela inicial", () => {
  const f = (teams: string[] = [], leagues: Favorites["leagues"] = []): Favorites => ({ teams: teams.map((k) => toFavoriteTeam(team(k))), leagues });
  const ms = [
    match(1, { leagueId: "libertadores", kickoff: "2026-10-24T22:00:00Z" }),
    match(2, { leagueId: "brasileirao-a", kickoff: "2026-10-24T21:30:00Z" }),
    match(3, { leagueId: "brasileirao-a", kickoff: "2026-10-24T19:30:00Z" }),
    match(4, { leagueId: "premier-league", kickoff: "2026-10-24T11:30:00Z" }),
  ];

  it("ordem do catálogo; liga sem jogo some", () => {
    const g = groupMatches(ms, EMPTY_FAVORITES);
    expect(g.map((x) => x.league.id)).toEqual(["brasileirao-a", "libertadores", "premier-league"]);
    expect(g.find((x) => x.league.id === "la-liga")).toBeUndefined();
  });

  it("dentro da liga, por horário", () => {
    expect(groupMatches(ms, EMPTY_FAVORITES)[0].matches.map((m) => m.id)).toEqual(["espn:bra.1:3", "espn:bra.1:2"]);
  });

  it("ligas favoritas vêm primeiro, mantendo a ordem do catálogo entre elas", () => {
    const g = groupMatches(ms, f([], ["premier-league", "libertadores"]));
    expect(g.map((x) => [x.league.id, x.favorite])).toEqual([["libertadores", true], ["premier-league", true], ["brasileirao-a", false]]);
  });

  it("dentro da liga, jogos de times favoritos vêm primeiro", () => {
    const g = groupMatches(ms, f(["casa2"]));
    expect(g[0].matches.map((m) => m.id)).toEqual(["espn:bra.1:2", "espn:bra.1:3"]);
  });

  it("o time favorito pode ser o visitante", () => {
    expect(involvesFavorite(match(2), f(["fora2"]))).toBe(true);
    expect(involvesFavorite(match(2), f(["fora9"]))).toBe(false);
  });

  it("não perde nem duplica jogo, e não altera a lista original", () => {
    const original = [...ms];
    const g = groupMatches(ms, f(["casa2"], ["libertadores"]));
    expect(g.flatMap((x) => x.matches).map((m) => m.id).sort()).toEqual(ms.map((m) => m.id).sort());
    expect(ms).toEqual(original);
  });

  it("lista vazia → nenhum grupo", () => {
    expect(groupMatches([], EMPTY_FAVORITES)).toEqual([]);
  });

  it("o catálogo no cliente tem todas as ligas, em ordem", () => {
    expect(PUBLIC_LEAGUES).toHaveLength(14);
    expect(leagueById("libertadores")?.shortName).toBe("Libertadores");
    expect(PUBLIC_LEAGUES[0].id).toBe("brasileirao-a");
  });

  it("detecta jogo ao vivo (inclui intervalo)", () => {
    expect(hasLive(ms)).toBe(false);
    expect(hasLive([match(1, { status: "live" })])).toBe(true);
    expect(hasLive([match(1, { status: "halftime" })])).toBe(true);
    expect(hasLive([match(1, { status: "finished" })])).toBe(false);
  });
});

describe("quando atualizar a tela", () => {
  const meta = (ttlSeconds: number) => ({ ttlSeconds });

  it("com jogo ao vivo segue o TTL do servidor, nunca abaixo de 15 s", () => {
    expect(nextRefreshMs(meta(20), { live: true, today: true })).toBe(20_000);
    expect(nextRefreshMs(meta(5), { live: true, today: true })).toBe(MIN_REFRESH_MS);
  });

  it("hoje, sem jogo ao vivo: confere a cada minuto (um jogo pode começar)", () => {
    expect(nextRefreshMs(meta(30), { live: false, today: true })).toBe(60_000);
  });

  it("dia passado ou futuro sem jogo ao vivo: não atualiza", () => {
    expect(nextRefreshMs(meta(30), { live: false, today: false })).toBeNull();
  });

  it("jogo ao vivo num dia que não é hoje (virou a meia-noite) continua atualizando", () => {
    expect(nextRefreshMs(meta(20), { live: true, today: false })).toBe(20_000);
  });

  it("teto de 2 min mesmo que o TTL seja enorme", () => {
    expect(nextRefreshMs(meta(21_600), { live: true, today: true })).toBe(MAX_REFRESH_MS);
  });

  it("em falha recua: 15 s, 30 s, 60 s, 120 s e fica em 120 s", () => {
    const at = (failures: number) => nextRefreshMs(meta(20), { live: true, today: true, failures });
    expect([1, 2, 3, 4, 5, 9].map(at)).toEqual([15_000, 30_000, 60_000, 120_000, 120_000, 120_000]);
  });

  it("em falha tenta de novo mesmo numa tela que normalmente não atualiza", () => {
    expect(nextRefreshMs(null, { live: false, today: false, failures: 1 })).toBe(15_000);
  });

  it("sem metadados usa 30 s como base", () => {
    expect(nextRefreshMs(null, { live: true, today: true })).toBe(30_000);
  });
});
