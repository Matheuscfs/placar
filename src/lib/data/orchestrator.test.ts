import { describe, expect, it } from "vitest";
import { LEAGUES } from "@/lib/domain/leagues";
import { LEAGUE_IDS, type LeagueId, type Match, type MatchDetail, type SourceId, type Standings, type TeamDetail } from "@/lib/domain/types";
import type { DataSource, SourceCapabilities } from "./data-source";
import { AllSourcesFailedError, DataSourceError } from "./errors";
import { Orchestrator } from "./orchestrator";
import { RateLimiter } from "./rate-limiter";

// 22/10/2026 12:00 em Brasília ("hoje" nos testes)
const T0 = Date.parse("2026-10-22T15:00:00Z");
const TODAY = "2026-10-22";

function clock() {
  let t = T0;
  return { now: () => t, advance: (seconds: number) => void (t += seconds * 1000) };
}

const down = (source: SourceId, msg = "caiu") => new DataSourceError("unavailable", msg, { source });

function mkMatch(source: SourceId, leagueId: LeagueId, n: number, over: Partial<Match> = {}): Match {
  const team = (side: string) => ({ id: `${source}:${side}${n}`, key: `${side}${n}`, name: `${side}${n}`, shortName: `${side}${n}`, abbr: "TTT" });
  return {
    id: `${source}:${leagueId}:${n}`,
    source,
    leagueId,
    season: "2026",
    round: null,
    kickoff: `2026-10-22T${String(18 + (n % 5)).padStart(2, "0")}:00:00Z`,
    status: "scheduled",
    statusText: null,
    clock: null,
    home: { team: team("h"), score: null, penalties: null, aggregate: null },
    away: { team: team("a"), score: null, penalties: null, aggregate: null },
    venue: null,
    ...over,
  };
}

const detailOf = (m: Match): MatchDetail => ({ ...m, referee: null, attendance: null, events: [], lineups: [], statistics: [] });
const standingsOf = (leagueId: LeagueId): Standings => ({ leagueId, season: "2026", groups: [{ name: null, rows: [] }] });

/** Fonte falsa: o teste decide o que cada operação devolve e vê quantas vezes foi chamada. */
function fake(id: SourceId, o: { leagues?: readonly LeagueId[]; caps?: Partial<SourceCapabilities> } = {}) {
  const covers = new Set<LeagueId>(o.leagues ?? LEAGUE_IDS);
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const h = {
    matches: (_date: string, leagues: LeagueId[]): Match[] => leagues.map((l) => mkMatch(id, l, 1)),
    live: (leagues: LeagueId[]): Match[] => leagues.map((l) => mkMatch(id, l, 1, { status: "live", clock: "10'" })),
    match: (matchId: string): MatchDetail => detailOf(mkMatch(id, "brasileirao-a", 1, { id: matchId })),
    standings: (l: LeagueId): Standings => standingsOf(l),
    team: (teamId: string): TeamDetail => ({ team: { id: teamId, key: "t", name: "T", shortName: "T", abbr: "TTT" }, leagueIds: [], upcoming: [], recent: [], standing: null }),
  };
  const rec = <A extends unknown[], R>(op: string, f: (...a: A) => R | Promise<R>) => async (...a: A): Promise<R> => {
    calls.push({ op, args: a });
    return await f(...a);
  };
  const src: DataSource = {
    id,
    capabilities: { live: true, events: true, lineups: true, statistics: true, standings: true, crests: true, ...o.caps },
    supportsLeague: (l) => covers.has(l),
    getLeagues: async () => [],
    getMatchesByDate: rec("matches", (d: string, ls?: LeagueId[]) => h.matches(d, ls ?? [...covers])),
    getLiveMatches: rec("live", (ls?: LeagueId[]) => h.live(ls ?? [...covers])),
    getMatch: rec("match", (matchId: string) => h.match(matchId)),
    getStandings: rec("standings", (l: LeagueId) => h.standings(l)),
    getTeam: rec("team", (teamId: string) => h.team(teamId)),
  };
  return { src, h, calls, count: (op: string) => calls.filter((c) => c.op === op).length };
}

type Fake = ReturnType<typeof fake>;

function build(sources: Fake[], extra: { limits?: Partial<Record<SourceId, { max: number; windowSeconds: number }>> } = {}) {
  const c = clock();
  const limiter = extra.limits
    ? new RateLimiter({ espn: { max: 1000, windowSeconds: 60 }, "football-data": { max: 1000, windowSeconds: 60 }, openfootball: { max: 1000, windowSeconds: 60 }, ...extra.limits }, c.now)
    : undefined;
  const orch = new Orchestrator({ sources: sources.map((s) => s.src), now: c.now, limiter });
  return { orch, c };
}

describe("jogos do dia — fonte por liga e proveniência", () => {
  it("a primeira fonte que cobre a liga responde, com proveniência completa", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    const { orch } = build([espn, fd]);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a", "libertadores"]);
    expect(r.data.map((m) => m.source)).toEqual(["espn", "espn"]);
    expect(r.meta).toMatchObject({ source: "espn", sources: ["espn"], cache: "miss", fallback: false, missing: [], failures: [] });
    expect(r.meta.fetchedAt).toBe("2026-10-22T15:00:00Z");
    expect(fd.calls).toHaveLength(0); // reserva não é tocada
  });

  it("a fonte é consultada UMA vez, para todas as ligas dela, não uma vez por liga", async () => {
    const espn = fake("espn");
    const { orch } = build([espn]);
    await orch.getMatchesByDate(TODAY, ["brasileirao-a", "libertadores", "premier-league"]);
    expect(espn.count("matches")).toBe(1);
    expect(espn.calls[0].args).toEqual([TODAY]); // sem filtro de ligas: o recorte é feito aqui, para o cache servir qualquer combinação
  });

  it("devolve só as ligas pedidas, mesmo a fonte entregando todas", async () => {
    const { orch } = build([fake("espn")]);
    const r = await orch.getMatchesByDate(TODAY, ["libertadores"]);
    expect(r.data.map((m) => m.leagueId)).toEqual(["libertadores"]);
  });

  it("sem ligas informadas, devolve todas as do catálogo cobertas, ainda com uma única chamada", async () => {
    const espn = fake("espn");
    const { orch } = build([espn]);
    const r = await orch.getMatchesByDate(TODAY);
    expect(espn.count("matches")).toBe(1);
    expect(r.data).toHaveLength(LEAGUES.length);
  });

  it("liga que a fonte não cobre vai para quem cobre: cada fonte só é consultada se cobre alguma liga pedida", async () => {
    const espn = fake("espn");
    const fd = fake("football-data", { leagues: ["brasileirao-a"] });
    const { orch } = build([fd, espn]); // fd tem prioridade, mas só cobre a Série A
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a", "libertadores"]);
    expect(fd.count("matches")).toBe(1);
    expect(espn.count("matches")).toBe(1);
    expect(Object.fromEntries(r.data.map((m) => [m.leagueId, m.source]))).toEqual({ "brasileirao-a": "football-data", libertadores: "espn" });
  });

  it("a fonte que não cobre nenhuma das ligas pedidas nem é chamada", async () => {
    const espn = fake("espn");
    const fd = fake("football-data", { leagues: ["premier-league"] });
    const { orch } = build([fd, espn]);
    await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(fd.calls).toHaveLength(0);
  });

  it("ligas cobertas por fontes diferentes: junta tudo, ordenado por horário; a fonte principal é a que cobriu mais ligas", async () => {
    const espn = fake("espn", { leagues: ["brasileirao-a", "libertadores"] });
    const fd = fake("football-data", { leagues: ["premier-league"] });
    espn.h.matches = (_d, ls) => ls.map((l) => mkMatch("espn", l, 1, { kickoff: "2026-10-22T22:00:00Z" }));
    fd.h.matches = (_d, ls) => ls.map((l) => mkMatch("football-data", l, 2, { kickoff: "2026-10-22T19:00:00Z" }));
    const { orch } = build([espn, fd]);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a", "libertadores", "premier-league"]);
    expect(r.data.map((m) => m.source)).toEqual(["football-data", "espn", "espn"]); // ordem por horário
    expect(r.meta).toMatchObject({ source: "espn", sources: ["espn", "football-data"], fallback: false, missing: [] }); // nenhuma foi plano B: cada fonte era a 1ª para as suas
  });
});

describe("fallback automático", () => {
  it("fonte principal caiu: usa a reserva, avisa e registra o que falhou", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    espn.h.matches = () => {
      throw down("espn", "ESPN fora do ar");
    };
    const { orch } = build([espn, fd]);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(r.data[0].source).toBe("football-data");
    expect(r.meta).toMatchObject({ source: "football-data", fallback: true, missing: [] });
    expect(r.meta.failures).toEqual([{ source: "espn", kind: "unavailable", message: "ESPN fora do ar" }]);
  });

  it("cai em cascata: ESPN → football-data → openfootball", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    const of = fake("openfootball");
    espn.h.matches = () => {
      throw down("espn");
    };
    fd.h.matches = () => {
      throw new DataSourceError("timeout", "lento", { source: "football-data" });
    };
    const { orch } = build([espn, fd, of]);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(r.data[0].source).toBe("openfootball");
    expect(r.meta.failures.map((f) => [f.source, f.kind])).toEqual([["espn", "unavailable"], ["football-data", "timeout"]]);
  });

  it("a reserva só cobre parte das ligas: o que ela entrega vale, o resto fica em `missing` para a UI avisar", async () => {
    const espn = fake("espn");
    const fd = fake("football-data", { leagues: ["brasileirao-a"] });
    espn.h.matches = () => {
      throw down("espn");
    };
    const { orch } = build([espn, fd]);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a", "libertadores"]);
    expect(r.data.map((m) => [m.leagueId, m.source])).toEqual([["brasileirao-a", "football-data"]]);
    expect(r.meta).toMatchObject({ fallback: true, missing: ["libertadores"] });
    expect(r.meta.failures).toHaveLength(1);
  });

  it("cascata com cobertura parcial: cada liga acaba na primeira fonte que responde e cobre", async () => {
    const espn = fake("espn");
    const fd = fake("football-data", { leagues: ["brasileirao-a"] });
    const of = fake("openfootball", { leagues: ["brasileirao-a", "libertadores"] });
    espn.h.matches = () => {
      throw down("espn");
    };
    const { orch } = build([espn, fd, of]);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a", "libertadores"]);
    expect(Object.fromEntries(r.data.map((m) => [m.leagueId, m.source]))).toEqual({ "brasileirao-a": "football-data", libertadores: "openfootball" });
    expect(r.meta).toMatchObject({ sources: ["football-data", "openfootball"], fallback: true, missing: [] });
  });

  it("todas as fontes falharam → erro com o motivo de cada uma", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    espn.h.matches = () => {
      throw down("espn");
    };
    fd.h.matches = () => {
      throw down("football-data");
    };
    const { orch } = build([espn, fd]);
    const err = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AllSourcesFailedError);
    expect((err as AllSourcesFailedError).failures.map((f) => f.source)).toEqual(["espn", "football-data"]);
  });

  it("'não cobre' (unsupported) é pulado em silêncio, sem aparecer como falha", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    espn.h.matches = () => {
      throw new DataSourceError("unsupported", "não tenho", { source: "espn" });
    };
    const { orch } = build([espn, fd]);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(r.data[0].source).toBe("football-data");
    expect(r.meta.failures).toEqual([]);
  });

  it("uma liga com resultado VAZIO é resposta válida (dia sem jogos não aciona fallback)", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    espn.h.matches = () => [];
    const { orch } = build([espn, fd]);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(r.data).toEqual([]);
    expect(fd.calls).toHaveLength(0);
    expect(r.meta.fallback).toBe(false);
  });

  it("ligas que nenhuma fonte cobre → unsupported", async () => {
    const { orch } = build([fake("football-data", { leagues: ["brasileirao-a"] })]);
    await expect(orch.getMatchesByDate(TODAY, ["libertadores"])).rejects.toMatchObject({ kind: "unsupported" });
  });
});

describe("cache", () => {
  it("segunda chamada sai do cache sem tocar a fonte, e diz a idade do dado", async () => {
    const espn = fake("espn");
    const { orch, c } = build([espn]);
    await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    c.advance(10);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(espn.count("matches")).toBe(1);
    expect(r.meta).toMatchObject({ cache: "hit", fetchedAt: "2026-10-22T15:00:00Z" });
    expect(r.meta.ttlSeconds).toBe(20); // 30 s de TTL do dia de hoje − 10 s já passados
  });

  it("depois do TTL busca de novo", async () => {
    const espn = fake("espn");
    const { orch, c } = build([espn]);
    await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    c.advance(31);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(espn.count("matches")).toBe(2);
    expect(r.meta.cache).toBe("miss");
  });

  it("20 requisições simultâneas viram UMA chamada à fonte", async () => {
    const espn = fake("espn");
    const { orch } = build([espn]);
    await Promise.all(Array.from({ length: 20 }, () => orch.getMatchesByDate(TODAY, ["brasileirao-a", "libertadores"])));
    expect(espn.count("matches")).toBe(1);
  });

  it("o cache é do DIA inteiro da fonte: qualquer combinação de ligas reaproveita a mesma busca", async () => {
    const espn = fake("espn");
    const { orch } = build([espn]);
    await orch.getMatchesByDate(TODAY, ["brasileirao-a", "libertadores"]);
    await orch.getMatchesByDate(TODAY, ["libertadores"]);
    await orch.getMatchesByDate(TODAY, ["premier-league", "la-liga"]);
    await orch.getMatchesByDate(TODAY);
    expect(espn.count("matches")).toBe(1);
  });

  it("datas diferentes são buscas diferentes", async () => {
    const espn = fake("espn");
    const { orch } = build([espn]);
    await orch.getMatchesByDate("2026-10-23", ["brasileirao-a"]);
    await orch.getMatchesByDate("2026-10-24", ["brasileirao-a"]);
    expect(espn.calls.map((c) => c.args[0])).toEqual(["2026-10-23", "2026-10-24"]);
  });

  it("dado de uma fonte reserva não vira cache da principal (cada fonte tem a sua chave)", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    let espnDown = true;
    espn.h.matches = (_d, ls) => {
      if (espnDown) throw down("espn");
      return [mkMatch("espn", ls[0], 1)];
    };
    const { orch, c } = build([espn, fd]);
    expect((await orch.getMatchesByDate(TODAY, ["brasileirao-a"])).data[0].source).toBe("football-data");
    espnDown = false;
    c.advance(0);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(r.data[0].source).toBe("espn"); // a ESPN voltou e reassume
  });

  describe("TTL decidido pelo conteúdo", () => {
    const ttlOf = async (matches: Match[], date = TODAY) => {
      const espn = fake("espn");
      espn.h.matches = () => matches;
      const { orch } = build([espn]);
      return (await orch.getMatchesByDate(date, ["brasileirao-a"])).meta.ttlSeconds;
    };

    it("hoje sem jogo ao vivo: 30 s", async () => expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { kickoff: "2026-10-22T23:00:00Z" })])).toBe(30));
    it("com jogo ao vivo: 20 s", async () => expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { status: "live" })])).toBe(20));
    it("intervalo também conta como ao vivo", async () => expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { status: "halftime" })])).toBe(20));
    it("jogo que começa em 1 minuto já usa TTL curto", async () => {
      expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { kickoff: "2026-10-22T15:01:00Z" })])).toBe(20);
    });
    it("jogo que já deveria ter começado (a fonte ainda diz 'agendado') também", async () => {
      expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { kickoff: "2026-10-22T14:50:00Z" })])).toBe(20);
    });
    it("'agendado' há mais de 3 h é dado ruim da fonte, não tempo real: TTL normal", async () => {
      expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { kickoff: "2026-10-22T11:00:00Z" })])).toBe(30);
    });
    it("dia passado, sem nada ao vivo: 6 h", async () => expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { status: "finished" })], "2026-10-20")).toBe(6 * 3600));
    it("dia passado com jogo ainda ao vivo (virou a meia-noite): 20 s", async () => expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { status: "live" })], "2026-10-21")).toBe(20));
    it("dia futuro: 30 min", async () => expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1)], "2026-10-25")).toBe(30 * 60));
    it("um jogo ao vivo em QUALQUER liga encurta o TTL do dia todo da fonte (é uma busca só)", async () => {
      const espn = fake("espn");
      espn.h.matches = () => [mkMatch("espn", "libertadores", 1, { status: "live" }), mkMatch("espn", "brasileirao-a", 2, { kickoff: "2026-10-22T23:00:00Z" })];
      const { orch } = build([espn]);
      expect((await orch.getMatchesByDate(TODAY, ["brasileirao-a"])).meta.ttlSeconds).toBe(20); // pediu só a Série A, mas a lista é do dia inteiro
    });

    describe("a lista nunca sobrevive ao início do próximo jogo", () => {
      const at = (secondsFromNow: number) => new Date(T0 + secondsFromNow * 1000).toISOString().replace(".000Z", "Z");
      const day = "2026-10-23"; // amanhã: TTL-base de 30 min

      it("amanhã cedo: segue o TTL-base de 30 min", async () => {
        expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { kickoff: "2026-10-23T22:00:00Z" })], day)).toBe(30 * 60);
      });
      it("próximo jogo em 5 min: o TTL cai para 300 s", async () => {
        expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { kickoff: at(300) })], day)).toBe(300);
      });
      it("próximo jogo em menos de 2 min já é 'iminente': TTL de 20 s", async () => {
        expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { kickoff: at(100) })], day)).toBe(20);
      });
      it("próximo jogo em 10 s: nunca abaixo do TTL mínimo de 20 s", async () => {
        expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { kickoff: at(10) })], day)).toBe(20);
      });
      it("vale o PRIMEIRO jogo, mesmo com outros depois", async () => {
        expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { kickoff: at(500) }), mkMatch("espn", "libertadores", 2, { kickoff: at(5000) })], day)).toBe(500);
      });
      it("jogo já encerrado não conta", async () => {
        expect(await ttlOf([mkMatch("espn", "brasileirao-a", 1, { kickoff: at(100), status: "finished" })], day)).toBe(30 * 60);
      });
    });
  });
});

describe("dado velho quando a fonte falha (stale-if-error)", () => {
  it("serve o último dado bom, marca como stale e registra a causa", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    const { orch, c } = build([espn, fd]);
    await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    c.advance(60); // passou do TTL (30 s), dentro da janela de velho (5 min)
    espn.h.matches = () => {
      throw down("espn", "ESPN caiu");
    };
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(r.data[0].source).toBe("espn");
    expect(r.meta).toMatchObject({ cache: "stale", fallback: false, fetchedAt: "2026-10-22T15:00:00Z" });
    expect(r.meta.failures).toEqual([{ source: "espn", kind: "unavailable", message: "ESPN caiu" }]);
    expect(fd.calls).toHaveLength(0);
  });

  it("passou da janela de velho: aí sim recorre à reserva", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    const { orch, c } = build([espn, fd]);
    await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    c.advance(30 + 5 * 60 + 1);
    espn.h.matches = () => {
      throw down("espn");
    };
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(r.data[0].source).toBe("football-data");
    expect(r.meta.fallback).toBe(true);
  });

  it("placar ao vivo velho tem janela curta: 60 s depois do TTL de 20 s", async () => {
    const espn = fake("espn");
    espn.h.matches = (_d, ls) => ls.map((l) => mkMatch("espn", l, 1, { status: "live", clock: "10'" }));
    const { orch, c } = build([espn]);
    await orch.getLiveMatches(["brasileirao-a"]);
    espn.h.matches = () => {
      throw down("espn");
    };
    c.advance(20 + 59);
    const stale = await orch.getLiveMatches(["brasileirao-a"]);
    expect(stale.meta.cache).toBe("stale");
    expect(stale.data).toHaveLength(1);
    c.advance(30); // passou de 20 + 60: placar ao vivo velho demais para mostrar
    await expect(orch.getLiveMatches(["brasileirao-a"])).rejects.toBeInstanceOf(AllSourcesFailedError);
  });
});

describe("cota por fonte", () => {
  it("nunca chama a fonte além da cota: o excedente vai para a reserva", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    const { orch } = build([espn, fd], { limits: { espn: { max: 2, windowSeconds: 60 } } });
    const dates = ["2026-10-23", "2026-10-24", "2026-10-25"]; // datas diferentes = cache miss em todas
    const results = [];
    for (const d of dates) results.push(await orch.getMatchesByDate(d, ["brasileirao-a"]));
    expect(espn.count("matches")).toBe(2); // a 3ª nunca chegou à ESPN
    expect(results.map((r) => r.data[0].source)).toEqual(["espn", "espn", "football-data"]);
    expect(results[2].meta.failures[0]).toMatchObject({ source: "espn", kind: "rate_limited" });
  });

  it("com a cota esgotada, dado velho em cache é servido em vez de chamar a fonte", async () => {
    const espn = fake("espn");
    const { orch, c } = build([espn], { limits: { espn: { max: 1, windowSeconds: 600 } } });
    await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    c.advance(60);
    const r = await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(espn.count("matches")).toBe(1);
    expect(r.meta.cache).toBe("stale");
    expect(r.meta.failures[0]).toMatchObject({ kind: "rate_limited" });
  });

  it("cache hit não gasta cota", async () => {
    const espn = fake("espn");
    const { orch } = build([espn], { limits: { espn: { max: 1, windowSeconds: 600 } } });
    for (let i = 0; i < 10; i++) await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    expect(espn.count("matches")).toBe(1);
  });

  it("a cota local esgotada não conta como falha da fonte (não abre o disjuntor)", async () => {
    const espn = fake("espn");
    const { orch } = build([espn], { limits: { espn: { max: 1, windowSeconds: 600 } } });
    await orch.getMatchesByDate("2026-10-23", ["brasileirao-a"]);
    for (const d of ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]) await orch.getMatchesByDate(d, ["brasileirao-a"]).catch(() => null);
    expect(orch.status().sources.find((s) => s.id === "espn")!.health.state).toBe("closed");
  });
});

describe("disjuntor", () => {
  const dates = ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"];

  it("depois de 3 falhas seguidas pula a fonte, sem esperar nem tentar", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    espn.h.matches = () => {
      throw down("espn");
    };
    const { orch } = build([espn, fd]);
    for (const d of dates.slice(0, 3)) await orch.getMatchesByDate(d, ["brasileirao-a"]);
    expect(espn.count("matches")).toBe(3);
    const r = await orch.getMatchesByDate(dates[3], ["brasileirao-a"]);
    expect(espn.count("matches")).toBe(3); // não tentou
    expect(r.data[0].source).toBe("football-data");
    expect(r.meta.failures[0].message).toMatch(/disjuntor/);
    expect(orch.status().sources[0].health.state).toBe("open");
  });

  it("depois do descanso faz uma chamada de teste; se a fonte voltou, fecha", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    let broken = true;
    espn.h.matches = (_d, ls) => {
      if (broken) throw down("espn");
      return [mkMatch("espn", ls[0], 1)];
    };
    const { orch, c } = build([espn, fd]);
    for (const d of dates.slice(0, 3)) await orch.getMatchesByDate(d, ["brasileirao-a"]);
    broken = false;
    c.advance(31);
    const r = await orch.getMatchesByDate(dates[3], ["brasileirao-a"]);
    expect(r.data[0].source).toBe("espn");
    expect(orch.status().sources[0].health.state).toBe("closed");
  });

  it("'não existe' é neutro: um 404 num id bobo não zera as falhas de uma fonte quebrada", async () => {
    const espn = fake("espn");
    espn.h.matches = () => {
      throw down("espn");
    };
    espn.h.match = () => {
      throw new DataSourceError("not_found", "x", { source: "espn" });
    };
    const { orch } = build([espn, fake("football-data")]);
    for (const d of dates.slice(0, 2)) await orch.getMatchesByDate(d, ["brasileirao-a"]);
    await orch.getMatch("espn:bra.1:1").catch(() => null);
    await orch.getMatchesByDate(dates[2], ["brasileirao-a"]);
    expect(orch.status().sources[0].health.state).toBe("open"); // 3 falhas seguidas, apesar do 404 no meio
  });

  it("'não existe' e 'não cobre' não contam como falha", async () => {
    const espn = fake("espn");
    espn.h.matches = () => {
      throw new DataSourceError("unsupported", "x", { source: "espn" });
    };
    const { orch } = build([espn, fake("football-data")]);
    for (const d of dates) await orch.getMatchesByDate(d, ["brasileirao-a"]);
    expect(orch.status().sources[0].health.state).toBe("closed");
  });
});

describe("ao vivo (derivado das listas de hoje e de ontem)", () => {
  const liveIn = (leagues: LeagueId[]) => (_d: string, ls: LeagueId[]) =>
    ls.map((l) => mkMatch("espn", l, 1, leagues.includes(l) ? { status: "live", clock: "67'" } : { kickoff: "2026-10-22T23:00:00Z" }));

  it("mostra só o que está ao vivo (e no intervalo), das ligas pedidas", async () => {
    const espn = fake("espn");
    espn.h.matches = (_d, ls) => [
      ...ls.map((l) => mkMatch("espn", l, 1, l === "brasileirao-a" ? { status: "live", clock: "67'" } : l === "libertadores" ? { status: "halftime" } : { status: "finished" })),
    ];
    const { orch } = build([espn]);
    const r = await orch.getLiveMatches(["brasileirao-a", "libertadores", "premier-league"]);
    expect(r.data.map((m) => [m.leagueId, m.status]).sort()).toEqual([["brasileirao-a", "live"], ["libertadores", "halftime"]]);
  });

  it("não tem chamadas próprias à fonte: custa só a lista de hoje e a de ontem", async () => {
    const espn = fake("espn");
    espn.h.matches = liveIn(["brasileirao-a"]);
    const { orch } = build([espn]);
    await orch.getLiveMatches();
    expect(espn.count("live")).toBe(0);
    expect(espn.calls.map((c) => c.args[0]).sort()).toEqual(["2026-10-21", "2026-10-22"]);
  });

  it("compartilha o cache com a lista do dia: pedir a lista de hoje antes não custa nada ao ao vivo", async () => {
    const espn = fake("espn");
    espn.h.matches = liveIn(["brasileirao-a"]);
    const { orch } = build([espn]);
    await orch.getMatchesByDate(TODAY);
    await orch.getLiveMatches();
    expect(espn.calls.map((c) => c.args[0])).toEqual([TODAY, "2026-10-21"]); // só a de ontem é nova
    await orch.getLiveMatches();
    expect(espn.count("matches")).toBe(2);
  });

  it("um mesmo jogo presente nas listas de ontem e de hoje (borda entre os dias) aparece uma vez só", async () => {
    const espn = fake("espn");
    espn.h.matches = (_d, ls) => ls.map((l) => mkMatch("espn", l, 1, { status: "live", clock: "10'" })); // mesmo id nos dois dias
    const { orch } = build([espn]);
    expect((await orch.getLiveMatches(["brasileirao-a"])).data).toHaveLength(1);
  });

  it("jogo que começou ontem e segue rolando depois da meia-noite aparece", async () => {
    const espn = fake("espn");
    espn.h.matches = (date, ls) => (date === "2026-10-21" ? [mkMatch("espn", ls[0], 7, { status: "live", clock: "88'" })] : []);
    const { orch } = build([espn]);
    const r = await orch.getLiveMatches(["brasileirao-a"]);
    expect(r.data.map((m) => m.clock)).toEqual(["88'"]);
  });

  it("se a lista de ontem falhar, o ao vivo de hoje ainda vale", async () => {
    const espn = fake("espn");
    espn.h.matches = (date, ls) => {
      if (date === "2026-10-21") throw down("espn");
      return ls.map((l) => mkMatch("espn", l, 1, { status: "live", clock: "10'" }));
    };
    const { orch } = build([espn]);
    const r = await orch.getLiveMatches(["brasileirao-a"]);
    expect(r.data).toHaveLength(1);
    expect(r.meta.fallback).toBe(false);
  });

  it("nenhum jogo ao vivo é uma resposta válida; o TTL é o da lista de hoje", async () => {
    const espn = fake("espn");
    espn.h.matches = liveIn([]);
    const { orch } = build([espn]);
    const r = await orch.getLiveMatches();
    expect(r.data).toEqual([]);
    expect(r.meta.ttlSeconds).toBe(30);
  });

  it("com jogo ao vivo o TTL cai para 20 s", async () => {
    const espn = fake("espn");
    espn.h.matches = liveIn(["brasileirao-a"]);
    const { orch } = build([espn]);
    expect((await orch.getLiveMatches()).meta.ttlSeconds).toBe(20);
  });

  it("ESPN caiu: usa uma reserva de placar atrasado, e avisa; fonte sem ao vivo nenhum nem é chamada", async () => {
    const espn = fake("espn");
    const fd = fake("football-data", { caps: { live: false, delayedLive: true } });
    const of = fake("openfootball", { caps: { live: false } });
    espn.h.matches = () => {
      throw down("espn");
    };
    fd.h.matches = liveIn(["brasileirao-a"]);
    const { orch } = build([espn, fd, of]);
    const r = await orch.getLiveMatches(["brasileirao-a"]);
    expect(r.meta).toMatchObject({ source: "football-data", fallback: true });
    expect(r.data).toHaveLength(1);
    expect(of.calls).toHaveLength(0); // não gastou cota à toa
  });

  it("ligas que nenhuma fonte com ao vivo cobre ficam em `missing`", async () => {
    const espn = fake("espn", { leagues: ["brasileirao-a"] });
    const of = fake("openfootball", { caps: { live: false } });
    espn.h.matches = liveIn(["brasileirao-a"]);
    const { orch } = build([espn, of]);
    const r = await orch.getLiveMatches(["brasileirao-a", "libertadores"]);
    expect(r.meta.missing).toEqual(["libertadores"]);
    expect(of.calls).toHaveLength(0);
  });

  it("todas as fontes caídas → erro com os motivos", async () => {
    const espn = fake("espn");
    espn.h.matches = () => {
      throw down("espn");
    };
    const { orch } = build([espn]);
    await expect(orch.getLiveMatches()).rejects.toBeInstanceOf(AllSourcesFailedError);
  });
});

describe("detalhe da partida e do time (preso a uma fonte)", () => {
  it("o id escolhe a fonte; sem fallback entre fontes", async () => {
    const espn = fake("espn");
    const fd = fake("football-data");
    const { orch } = build([espn, fd]);
    const r = await orch.getMatch("football-data:1001");
    expect(fd.count("match")).toBe(1);
    expect(espn.count("match")).toBe(0);
    expect(r.meta).toMatchObject({ source: "football-data", sources: ["football-data"], fallback: false });
  });

  it("id malformado → invalid_id; fonte desativada → unsupported; nada chega às fontes", async () => {
    const espn = fake("espn");
    const { orch } = build([espn]);
    await expect(orch.getMatch("lixo")).rejects.toMatchObject({ kind: "invalid_id" });
    await expect(orch.getMatch("espn:")).rejects.toMatchObject({ kind: "invalid_id" });
    await expect(orch.getMatch("openfootball:brasileirao-a:2026:x")).rejects.toMatchObject({ kind: "unsupported" });
    expect(espn.calls).toHaveLength(0);
  });

  it("o erro da fonte é o erro da operação (404 continua 404)", async () => {
    const espn = fake("espn");
    espn.h.match = () => {
      throw new DataSourceError("not_found", "sumiu", { source: "espn" });
    };
    const { orch } = build([espn]);
    await expect(orch.getMatch("espn:bra.1:1")).rejects.toMatchObject({ kind: "not_found" });
  });

  it("'não existe' fica guardado por 60 s: repetir o mesmo id inválido não gasta a cota", async () => {
    const espn = fake("espn");
    espn.h.match = () => {
      throw new DataSourceError("not_found", "sumiu", { source: "espn" });
    };
    const { orch, c } = build([espn]);
    for (let i = 0; i < 5; i++) await orch.getMatch("espn:bra.1:999").catch(() => null);
    expect(espn.count("match")).toBe(1);
    c.advance(61);
    await orch.getMatch("espn:bra.1:999").catch(() => null);
    expect(espn.count("match")).toBe(2);
  });

  it("TTL pelo status: ao vivo 20 s, encerrado 1 h, agendado 2 min", async () => {
    const espn = fake("espn");
    const { orch } = build([espn]);
    const ttl = async (over: Partial<Match>) => {
      espn.h.match = (id) => detailOf(mkMatch("espn", "brasileirao-a", 1, { id, ...over }));
      return (await orch.getMatch(`espn:bra.1:${Math.random()}`.replace("0.", ""))).meta.ttlSeconds;
    };
    expect(await ttl({ status: "live" })).toBe(20);
    expect(await ttl({ status: "finished" })).toBe(3600);
    expect(await ttl({ status: "scheduled", kickoff: "2026-10-22T23:00:00Z" })).toBe(120);
    expect(await ttl({ status: "scheduled", kickoff: "2026-10-22T15:01:00Z" })).toBe(20);
  });

  it("fonte caiu: serve o último detalhe bom (velho)", async () => {
    const espn = fake("espn");
    espn.h.match = (id) => detailOf(mkMatch("espn", "brasileirao-a", 1, { id, status: "finished" }));
    const { orch, c } = build([espn]);
    await orch.getMatch("espn:bra.1:1");
    c.advance(3600 + 10); // passou do TTL de 1 h dos encerrados, dentro das 24 h de dado velho
    espn.h.match = () => {
      throw down("espn");
    };
    const r = await orch.getMatch("espn:bra.1:1");
    expect(r.meta.cache).toBe("stale");
    expect(r.meta.failures[0]).toMatchObject({ source: "espn", kind: "unavailable" });
  });

  it("time: a consulta da mesma liga é cacheada; ligas diferentes têm chaves diferentes", async () => {
    const espn = fake("espn");
    const { orch } = build([espn]);
    await orch.getTeam("espn:874");
    await orch.getTeam("espn:874");
    await orch.getTeam("espn:874", { leagueId: "brasileirao-a" });
    expect(espn.count("team")).toBe(2);
  });
});

describe("classificação", () => {
  it("cai de fonte em fonte, pulando as que não têm classificação", async () => {
    const espn = fake("espn");
    const fd = fake("football-data", { caps: { standings: false } });
    const of = fake("openfootball");
    espn.h.standings = () => {
      throw down("espn");
    };
    const { orch } = build([espn, fd, of]);
    const r = await orch.getStandings("brasileirao-a");
    expect(r.meta).toMatchObject({ source: "openfootball", fallback: true });
    expect(fd.calls).toHaveLength(0);
  });

  it("todas falharam → erro com os motivos", async () => {
    const espn = fake("espn");
    espn.h.standings = () => {
      throw down("espn");
    };
    const { orch } = build([espn]);
    await expect(orch.getStandings("brasileirao-a")).rejects.toBeInstanceOf(AllSourcesFailedError);
  });

  it("competição sem tabela (a fonte diz 'não existe'): é 'unsupported', não 'todas as fontes falharam'", async () => {
    const espn = fake("espn");
    espn.h.standings = () => {
      throw new DataSourceError("not_found", "A ESPN não tem classificação para copa-do-brasil", { source: "espn" });
    };
    const { orch } = build([espn]);
    await expect(orch.getStandings("copa-do-brasil")).rejects.toMatchObject({ kind: "unsupported", message: expect.stringContaining("Copa do Brasil") });
    await expect(orch.getStandings("copa-do-brasil")).rejects.not.toBeInstanceOf(AllSourcesFailedError);
  });

  it("'não existe' numa fonte e fonte fora do ar na outra: continua sendo falha (pode ser passageira)", async () => {
    const espn = fake("espn");
    const of = fake("openfootball");
    espn.h.standings = () => {
      throw new DataSourceError("not_found", "sem tabela", { source: "espn" });
    };
    of.h.standings = () => {
      throw down("openfootball");
    };
    const { orch } = build([espn, of]);
    await expect(orch.getStandings("brasileirao-a")).rejects.toBeInstanceOf(AllSourcesFailedError);
  });

  it("nenhuma fonte tem classificação → unsupported", async () => {
    const { orch } = build([fake("espn", { caps: { standings: false } })]);
    await expect(orch.getStandings("brasileirao-a")).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("TTL de 10 min e cache", async () => {
    const espn = fake("espn");
    const { orch } = build([espn]);
    const a = await orch.getStandings("brasileirao-a");
    const b = await orch.getStandings("brasileirao-a");
    expect(a.meta.ttlSeconds).toBe(600);
    expect(b.meta.cache).toBe("hit");
    expect(espn.count("standings")).toBe(1);
  });
});

describe("catálogo e diagnóstico", () => {
  it("lista as ligas com as fontes que cobrem cada uma, na ordem de exibição, sem usar a rede", () => {
    const espn = fake("espn");
    const fd = fake("football-data", { leagues: ["brasileirao-a", "premier-league"] });
    const { orch } = build([espn, fd]);
    const leagues = orch.getLeagues();
    expect(leagues.map((l) => l.order)).toEqual([...leagues.map((l) => l.order)].sort((a, b) => a - b));
    expect(leagues.find((l) => l.id === "brasileirao-a")!.sources).toEqual(["espn", "football-data"]);
    expect(leagues.find((l) => l.id === "libertadores")!.sources).toEqual(["espn"]);
    expect(espn.calls).toHaveLength(0);
  });

  it("não lista ligas que nenhuma fonte ativa cobre", () => {
    const { orch } = build([fake("football-data", { leagues: ["brasileirao-a"] })]);
    expect(orch.getLeagues().map((l) => l.id)).toEqual(["brasileirao-a"]);
  });

  it("status: saúde, cota restante e erros recentes (só falhas reais)", async () => {
    const espn = fake("espn");
    espn.h.matches = () => {
      throw down("espn", "ESPN caiu");
    };
    espn.h.match = () => {
      throw new DataSourceError("not_found", "não existe", { source: "espn" });
    };
    const { orch } = build([espn, fake("football-data")], { limits: { espn: { max: 10, windowSeconds: 60 } } });
    await orch.getMatchesByDate(TODAY, ["brasileirao-a"]);
    await orch.getMatch("espn:bra.1:1").catch(() => null);
    const s = orch.status();
    const e = s.sources.find((x) => x.id === "espn")!;
    expect(e.health).toMatchObject({ state: "closed", consecutiveFailures: 1 });
    expect(e.quota).toEqual({ remaining: 8, max: 10, windowSeconds: 60 }); // 2 chamadas gastas
    expect(s.recentErrors).toHaveLength(1); // o 'não existe' não é erro da fonte
    expect(s.recentErrors[0]).toMatchObject({ source: "espn", operation: "matches", kind: "unavailable", message: "ESPN caiu" });
    expect(s.cacheEntries).toBeGreaterThan(0);
  });
});
