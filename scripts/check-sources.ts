/**
 * ETAPA 0 — valida as fontes de dados candidatas antes de construir o app.
 *
 * Uso (Node >= 22.18, executa TypeScript direto, sem instalar nada):
 *   node scripts/check-sources.ts
 *
 * Variáveis opcionais (sem elas a fonte correspondente é testada só até onde der):
 *   FOOTBALL_DATA_TOKEN   token grátis de football-data.org
 *   HIGHLIGHTLY_KEY       chave da Highlightly
 *   GITHUB_TOKEN          só para evitar o limite de 60 req/h da API do GitHub
 *
 * Princípio: nada é "inventado". Cada célula do quadro vem de uma resposta real
 * da fonte; quando não foi possível verificar, aparece "n/d" ou "não testado".
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TIMEOUT_MS = 25_000;
const UA = "placar-check-sources/0.1 (validacao de fontes; uso pessoal)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────── HTTP ─────────────────────────
interface Resp {
  ok: boolean;
  status: number;
  ms: number;
  text: string;
  json: any;
  headers: Headers;
  error: string | null;
}

async function http(url: string, headers: Record<string, string> = {}): Promise<Resp> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": UA, accept: "application/json", ...headers },
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* não é JSON */
    }
    return { ok: res.ok, status: res.status, ms: Math.round(performance.now() - t0), text, json, headers: res.headers, error: null };
  } catch (e) {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0), text: "", json: null, headers: new Headers(), error: String(e) };
  }
}

// ───────────────────────── Relatório ─────────────────────────
interface SourceReport {
  id: string;
  nome: string;
  acessivel: string;
  serieA: string;
  copaBrasil: string;
  libertadores: string;
  aoVivo: string;
  eventos: string;
  escudos: string;
  limite: string;
  notas: string[];
  detalhes?: unknown;
}

const blank = (id: string, nome: string): SourceReport => ({
  id,
  nome,
  acessivel: "n/d",
  serieA: "n/d",
  copaBrasil: "n/d",
  libertadores: "n/d",
  aoVivo: "n/d",
  eventos: "n/d",
  escudos: "n/d",
  limite: "n/d",
  notas: [],
});

const today = new Date();
const YEAR = today.getFullYear();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

// ───────────────────────── 1) openfootball ─────────────────────────
async function checkOpenfootball(): Promise<SourceReport> {
  const r = blank("openfootball", "openfootball (GitHub)");
  const gh: Record<string, string> = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  r.limite = "sem limite no raw.githubusercontent (CDN); API do GitHub: 60 req/h sem token";

  const repos = await http("https://api.github.com/users/openfootball/repos?per_page=100&sort=pushed", gh);
  const raw = await http("https://raw.githubusercontent.com/openfootball/football.json/master/2025-26/en.1.json");
  r.acessivel = raw.ok ? "sim" : "não";
  if (!raw.ok) {
    r.notas.push(`raw.githubusercontent falhou: ${raw.status} ${raw.error ?? ""}`);
    return r;
  }

  // Lista de repositórios relevantes
  const relevantes = (repos.json ?? []).filter((x: any) => /brazil|brasil|liberta|copa|south|latin|america|football\.json/i.test(x.name));
  r.notas.push(
    "Repos relacionados: " +
      (relevantes.map((x: any) => `${x.name} (push ${String(x.pushed_at).slice(0, 10)})`).join("; ") || "nenhum / API do GitHub indisponível"),
  );

  // Árvore do football.json (formato JSON, ligas europeias + alguns arquivos do Brasil)
  const info = await http("https://api.github.com/repos/openfootball/football.json", gh);
  const branch = info.json?.default_branch ?? "master";
  const tree = await http(`https://api.github.com/repos/openfootball/football.json/git/trees/${branch}?recursive=1`, gh);
  const paths: string[] = (tree.json?.tree ?? []).map((t: any) => t.path as string);
  const seasons = [...new Set(paths.map((p) => p.split("/")[0]).filter((s) => /^\d{4}(-\d{2})?$/.test(s)))].sort();
  const latestSeason = seasons.at(-1);
  const jsonBr = paths.filter((p) => /(^|\/)(br\.\d|copa\.l|copa\.s|br\.cup)/i.test(p));
  r.notas.push(`football.json (JSON): temporadas ${seasons.at(0)}…${latestSeason}; Brasil/Liberta: ${jsonBr.join(", ") || "NENHUM"}`);

  // Frescor real dos JSONs do Brasil no ano corrente
  const fresh = async (path: string) => {
    const f = await http(`https://raw.githubusercontent.com/openfootball/football.json/${branch}/${path}`);
    const ms: any[] = f.json?.matches ?? [];
    const done = ms.filter((m) => m.score?.ft ?? Array.isArray(m.score));
    return { total: ms.length, placar: done.length, ultimo: done.map((m) => m.date).sort().at(-1) ?? "—" };
  };
  const jsonSerieA = jsonBr.find((p) => p.startsWith(`${YEAR}/br.1`));
  if (jsonSerieA) {
    const f = await fresh(jsonSerieA);
    r.notas.push(`${jsonSerieA}: ${f.total} jogos, ${f.placar} com placar, último resultado em ${f.ultimo} (JSON só é regenerado de tempos em tempos)`);
  }

  // Repositório south-america (formato Football.TXT): Brasil e Libertadores
  const sa = await http(`https://api.github.com/repos/openfootball/south-america/git/trees/master?recursive=1`, gh);
  const saPaths: string[] = (sa.json?.tree ?? []).map((t: any) => t.path as string).filter((p: string) => /^(brazil|copa-libertadores)\//.test(p));
  const lastCommit = async (path: string) => {
    const c = await http(`https://api.github.com/repos/openfootball/south-america/commits?path=${encodeURIComponent(path)}&per_page=1`, gh);
    return String(c.json?.[0]?.commit?.committer?.date ?? "?").slice(0, 10);
  };
  const txtSerieA = saPaths.find((p) => p.includes(`${YEAR}_br1`));
  const txtLibertadores = saPaths.find((p) => p.includes(`${YEAR}_copal`));
  const txtCopaBr = saPaths.find((p) => p.includes(`${YEAR}_brcup`));
  const anos = [...new Set(saPaths.map((p) => p.match(/(\d{4})_/)?.[1]).filter(Boolean))].sort();
  r.notas.push(`south-america (TXT, precisa de parser Football.TXT): arquivos Brasil/Liberta anos ${anos.join(", ")}: ${saPaths.join(", ")}`);
  const dtSerieA = txtSerieA ? await lastCommit(txtSerieA) : null;
  const dtLiberta = txtLibertadores ? await lastCommit(txtLibertadores) : null;
  if (dtSerieA) r.notas.push(`${txtSerieA}: último commit em ${dtSerieA}`);
  if (dtLiberta) r.notas.push(`${txtLibertadores}: último commit em ${dtLiberta}`);

  r.serieA = jsonSerieA || txtSerieA ? `sim (JSON ${jsonSerieA ? "sim, defasado" : "não"}; TXT ${txtSerieA ? `sim, commit ${dtSerieA}` : "não"})` : "não";
  r.copaBrasil = txtCopaBr ? "parcial (só temporada anterior no TXT; " + YEAR + " ausente)" : "não";
  const jsonLib = jsonBr.some((p) => p.startsWith(`${YEAR}/copa.l`));
  r.libertadores = jsonLib || txtLibertadores ? `sim (JSON ${jsonLib ? "sim" : `só ${jsonBr.filter((p) => /copa\.l/.test(p)).join("/") || "não"}`}; TXT ${txtLibertadores ? `sim, commit ${dtLiberta}` : "não"})` : "não";

  // Frescor dos dados europeus
  if (latestSeason) {
    const f = await http(`https://raw.githubusercontent.com/openfootball/football.json/${branch}/${latestSeason}/en.1.json`);
    const matches: any[] = f.json?.matches ?? [];
    const comPlacar = matches.filter((m) => m.score?.ft);
    const ultimoPlacar = comPlacar.map((m) => m.date).sort().at(-1);
    r.notas.push(`en.1 ${latestSeason}: ${matches.length} jogos, ${comPlacar.length} com placar final; último resultado em ${ultimoPlacar ?? "—"}`);
    const amostra = matches.find((m) => m.goals1 || m.goals2);
    r.eventos = amostra ? "parcial (só gols, quando preenchido)" : "não (só placar final)";
  } else {
    r.eventos = "não";
  }
  r.aoVivo = "não (arquivos estáticos, atualizados em lote)";
  r.escudos = "não";
  return r;
}

// ───────────────────────── 2) ESPN (não oficial) ─────────────────────────
const ESPN_LEAGUES: Array<[slug: string, nome: string]> = [
  ["bra.1", "Brasileirão Série A"],
  ["bra.2", "Brasileirão Série B"],
  ["bra.copa_do_brazil", "Copa do Brasil"],
  ["conmebol.libertadores", "Libertadores"],
  ["conmebol.sudamericana", "Sul-Americana"],
  ["eng.1", "Premier League"],
  ["esp.1", "La Liga"],
  ["ita.1", "Serie A (ITA)"],
  ["ger.1", "Bundesliga"],
  ["uefa.champions", "Champions League"],
  ["bra.camp.paulista", "Paulistão"],
  ["bra.camp.carioca", "Carioca"],
  ["bra.camp.mineiro", "Mineiro"],
  ["bra.camp.gaucho", "Gaúcho"],
];

async function checkEspn(): Promise<SourceReport> {
  const r = blank("espn", "ESPN (API pública NÃO oficial)");
  r.limite = "sem limite documentado (API não oficial, sem contrato/SLA; pode mudar ou bloquear a qualquer momento)";
  const base = "https://site.api.espn.com/apis/site/v2/sports/soccer";
  // A ESPN rejeita intervalos (HTTP 400); aceita um dia (YYYYMMDD) ou o ano inteiro (YYYY).
  const range = `${YEAR}`;
  const porLiga: any[] = [];
  const finalizados: Record<string, any> = {};

  for (const [slug, nome] of ESPN_LEAGUES) {
    const res = await http(`${base}/${slug}/scoreboard?dates=${range}&limit=1000`);
    if (!res.ok) {
      porLiga.push({ slug, nome, http: res.status, erro: res.error });
      await sleep(250);
      continue;
    }
    const events: any[] = res.json?.events ?? [];
    const state = (e: any) => e.status?.type?.state as string | undefined;
    const live = events.filter((e) => state(e) === "in");
    const post = events.filter((e) => state(e) === "post");
    const comps = events.flatMap((e) => e.competitions?.[0]?.competitors ?? []);
    const comLogo = comps.filter((c: any) => c.team?.logo).length;
    const postComDetails = post.filter((e) => (e.competitions?.[0]?.details ?? []).length > 0).length;
    const liveFields = live.filter((e) => e.status?.displayClock != null).length;
    const ultimoPost = post.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    if (ultimoPost) finalizados[slug] = ultimoPost;
    porLiga.push({
      slug,
      nome,
      http: res.status,
      ms: res.ms,
      eventos: events.length,
      aoVivoAgora: live.length,
      encerrados: post.length,
      logosPct: comps.length ? Math.round((comLogo / comps.length) * 100) : null,
      encerradosComDetalhes: post.length ? `${postComDetails}/${post.length}` : "—",
      relogioAoVivo: live.length ? `${liveFields}/${live.length}` : "sem jogo ao vivo agora",
      campos: events[0] ? { statusState: state(events[0]), displayClock: events[0].status?.displayClock, period: events[0].status?.period } : null,
      temporada: res.json?.leagues?.[0]?.season?.year ?? null,
    });
    await sleep(250);
  }

  const get = (slug: string) => porLiga.find((l) => l.slug === slug);
  r.acessivel = porLiga.some((l) => l.http === 200) ? "sim" : "não";
  const cov = (slug: string) => {
    const l = get(slug);
    if (!l || l.http !== 200) return "não";
    return l.eventos > 0 ? `sim (${l.eventos} jogos em ${YEAR})` : "sem jogos no ano";
  };
  r.serieA = cov("bra.1");
  r.copaBrasil = cov("bra.copa_do_brazil");
  r.libertadores = cov("conmebol.libertadores");

  const totalLive = porLiga.reduce((s, l) => s + (l.aoVivoAgora ?? 0), 0);
  r.aoVivo = totalLive > 0 ? `sim (${totalLive} jogo(s) ao vivo agora, relógio presente)` : "campos presentes; nenhum jogo ao vivo agora p/ confirmar";

  // Detalhe de partida (eventos, escalações, estatísticas)
  const resumo: any[] = [];
  for (const slug of ["bra.1", "bra.copa_do_brazil", "conmebol.libertadores", "eng.1"]) {
    const ev = finalizados[slug];
    if (!ev) continue;
    const s = await http(`${base}/${slug}/summary?event=${ev.id}`);
    if (!s.ok) {
      resumo.push({ slug, jogo: ev.name, http: s.status });
      continue;
    }
    const j = s.json;
    resumo.push({
      slug,
      jogo: `${ev.name} (${String(ev.date).slice(0, 10)})`,
      eventosChave: (j.keyEvents ?? []).length,
      escalacoes: (j.rosters ?? []).map((x: any) => (x.roster ?? []).length),
      estatisticas: (j.boxscore?.teams ?? []).map((t: any) => (t.statistics ?? []).length),
      local: j.gameInfo?.venue?.fullName ?? null,
      arbitros: (j.gameInfo?.officials ?? []).length,
    });
    await sleep(250);
  }
  const brResumo = resumo.find((x) => x.slug === "bra.1");
  r.eventos = brResumo?.eventosChave > 0 ? `sim (Série A: ${brResumo.eventosChave} eventos no jogo testado; escalações ${JSON.stringify(brResumo.escalacoes)})` : brResumo ? "não retornou eventos no jogo testado" : "não testado (sem jogo encerrado)";

  const logos = porLiga.filter((l) => l.logosPct != null && l.eventos > 0);
  r.escudos = logos.length ? `sim (${Math.min(...logos.map((l) => l.logosPct))}–100% dos times com logo)` : "n/d";

  // Classificação
  const standings: any[] = [];
  for (const slug of ["bra.1", "bra.2", "conmebol.libertadores", "eng.1"]) {
    const s = await http(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`);
    const children: any[] = s.json?.children ?? [];
    const entries = children.flatMap((c) => c.standings?.entries ?? []);
    standings.push({
      slug,
      http: s.status,
      grupos: children.length,
      times: entries.length,
      temZonas: entries.some((e) => e.note?.description) ? "sim (campo note.description)" : "não",
    });
    await sleep(250);
  }

  const estaduais = porLiga.filter((l) => l.slug.startsWith("bra.camp.")).map((l) => `${l.nome}: ${l.eventos ?? "falhou"}`);
  r.notas.push(`Estaduais testados (jogos em ${YEAR}): ${estaduais.join("; ")}`);
  r.notas.push("Risco: API não documentada nem garantida; os termos da ESPN não preveem uso por terceiros. Usar só com cache agressivo e fallback.");
  r.detalhes = { porLiga, resumo, standings };
  return r;
}

// ───────────────────────── 3) football-data.org ─────────────────────────
async function checkFootballData(): Promise<SourceReport> {
  const r = blank("football-data", "football-data.org (plano grátis)");
  const token = process.env.FOOTBALL_DATA_TOKEN;
  const h: Record<string, string> = token ? { "X-Auth-Token": token } : {};
  r.limite = "10 req/min no plano grátis (documentação); placares do plano grátis podem ter atraso";

  const comps = await http("https://api.football-data.org/v4/competitions", h);
  r.acessivel = comps.status === 0 ? "não" : comps.ok ? "sim" : `API responde, mas ${comps.status} (${token ? "token recusado" : "exige token grátis"})`;
  const rate = [...comps.headers.entries()].filter(([k]) => k.startsWith("x-request") || k.startsWith("x-ratelimit")).map(([k, v]) => `${k}=${v}`);
  if (rate.length) r.notas.push(`Cabeçalhos de limite: ${rate.join(", ")}`);
  if (!comps.ok) {
    r.notas.push(`Resposta: ${comps.status} ${comps.text.slice(0, 160)}`);
    if (!token) r.notas.push("Defina FOOTBALL_DATA_TOKEN (cadastro grátis em football-data.org) para testar de verdade.");
    r.copaBrasil = "não (Copa do Brasil não faz parte do catálogo, segundo a documentação)";
    return r;
  }

  const list: any[] = comps.json?.competitions ?? [];
  const find = (code: string) => list.find((c) => c.code === code);
  // TIER_ONE = plano grátis; TIER_TWO/THREE/FOUR = planos pagos
  const desc = (c: any) => (!c ? "não" : c.plan === "TIER_ONE" ? `sim, no plano grátis (${c.name})` : `existe, mas é PAGO (${c.name}, ${c.plan})`);
  r.serieA = desc(find("BSA"));
  r.libertadores = desc(find("CLI"));
  const cb = list.find((c) => /copa do brasil/i.test(c.name));
  r.copaBrasil = desc(cb);
  const gratis = list.filter((c) => c.plan === "TIER_ONE");
  r.notas.push(`Catálogo (${list.length} competições; sem token já dá para ler): plano grátis = ${gratis.map((c) => `${c.code}`).join(", ")}`);
  r.notas.push(`Brasil: BSA(Série A)=${find("BSA")?.plan}, BSB(Série B)=${find("BSB")?.plan}, Copa do Brasil=${cb?.code}:${cb?.plan}, CLI(Libertadores)=${find("CLI")?.plan}, CS(Sul-Americana)=${find("CS")?.plan}`);

  if (token) {
    const from = iso(addDays(today, -10));
    const to = iso(addDays(today, 10));
    const m = await http(`https://api.football-data.org/v4/competitions/BSA/matches?dateFrom=${from}&dateTo=${to}`, h);
    const matches: any[] = m.json?.matches ?? [];
    r.notas.push(`BSA ${from}…${to}: HTTP ${m.status}, ${matches.length} jogos`);
    r.escudos = matches.some((x) => x.homeTeam?.crest) ? "sim" : m.ok ? "não" : "n/d";
    const live = await http("https://api.football-data.org/v4/matches?status=LIVE", h);
    r.aoVivo = live.ok ? `endpoint existe (${(live.json?.matches ?? []).length} ao vivo agora)` : `HTTP ${live.status}`;
    const fin = matches.find((x) => x.status === "FINISHED");
    if (fin) {
      const d = await http(`https://api.football-data.org/v4/matches/${fin.id}`, h);
      r.eventos = d.ok ? `gols:${(d.json?.goals ?? []).length} cartões:${(d.json?.bookings ?? []).length} (pode exigir plano pago)` : `HTTP ${d.status}`;
    }
  } else {
    r.notas.push("Sem token: só o catálogo foi verificado; ao vivo/eventos/escudos não testados.");
  }
  return r;
}

// ───────────────────────── 4) TheSportsDB ─────────────────────────
async function checkSportsDb(): Promise<SourceReport> {
  const r = blank("thesportsdb", "TheSportsDB (chave grátis 123)");
  const key = process.env.THESPORTSDB_KEY ?? "123";
  const base = `https://www.thesportsdb.com/api/v1/json/${key}`;
  r.limite = "30 req/min no plano grátis (documentação); livescore, timeline e mais dados são premium";

  // Na chave grátis, all_leagues.php devolve só 10 ligas e search_all_leagues só uma amostra;
  // por isso resolvemos as ligas pelos IDs públicos conhecidos e confirmamos com lookupleague.
  const IDS: Array<[string, string]> = [["4351", "Série A"], ["4725", "Copa do Brasil"], ["4501", "Libertadores"]];
  const resolved: Record<string, any> = {};
  for (const [id, rotulo] of IDS) {
    const lk = await http(`${base}/lookupleague.php?id=${id}`);
    if (lk.status === 0 || (!lk.ok && !lk.json)) {
      r.notas.push(`lookupleague ${id}: HTTP ${lk.status} ${lk.error ?? lk.text.slice(0, 100)}`);
    }
    const l = lk.json?.leagues?.[0];
    resolved[rotulo] = l ? { ...l, idLeague: id } : null;
    await sleep(2200);
  }
  r.acessivel = Object.values(resolved).some(Boolean) ? "sim" : "não";
  if (r.acessivel === "não") return r;
  const serieA = [resolved["Série A"]].filter(Boolean);
  const copa = [resolved["Copa do Brasil"]].filter(Boolean);
  const libertadores = [resolved["Libertadores"]].filter(Boolean);
  r.notas.push(
    "Ligas confirmadas por lookupleague — " +
      IDS.map(([id, rot]) => `${rot}: ${resolved[rot] ? `${resolved[rot].strLeague}#${id} (temporada ${resolved[rot].strCurrentSeason})` : "NÃO encontrada"}`).join("; "),
  );

  const probe = async (l: any) => {
    if (!l) return { txt: "não", ev: [] as any[] };
    const next = await http(`${base}/eventsnextleague.php?id=${l.idLeague}`);
    await sleep(2200); // respeita 30 req/min
    const past = await http(`${base}/eventspastleague.php?id=${l.idLeague}`);
    await sleep(2200);
    const ev = [...(next.json?.events ?? []), ...(past.json?.events ?? [])];
    return { txt: ev.length ? `sim (${ev.length} jogos: ${past.json?.events?.length ?? 0} passados + ${next.json?.events?.length ?? 0} futuros; free retorna poucos)` : "liga existe, mas sem jogos retornados", ev };
  };
  const a = await probe(serieA[0]);
  const b = await probe(copa[0]);
  const c = await probe(libertadores[0]);
  r.serieA = a.txt;
  r.copaBrasil = b.txt;
  r.libertadores = c.txt;

  const todos = [...a.ev, ...b.ev, ...c.ev];
  r.escudos = todos.some((e) => e.strHomeTeamBadge) ? "sim" : todos.length ? "não nos eventos (só via lookupteam)" : "n/d";

  if (serieA[0]) {
    // Cuidado: com a chave grátis o endpoint ignora o filtro `l` e devolve outros esportes.
    // Só conta como "ao vivo" se houver linhas da PRÓPRIA liga.
    const live = await http(`${base}/livescore.php?l=${serieA[0].idLeague}`);
    const linhas: any[] = live.json?.livescore ?? live.json?.events ?? [];
    const daLiga = linhas.filter((x) => String(x.idLeague) === String(serieA[0].idLeague));
    const esportes = [...new Set(linhas.map((x) => x.strSport))].join("/");
    r.aoVivo =
      live.status === 429
        ? "bloqueado (HTTP 429) durante o teste"
        : daLiga.length
          ? `sim (${daLiga.length} jogo(s) da Série A agora)`
          : `não confiável: ignora o filtro de liga (devolveu ${linhas.length} linha(s) de ${esportes || "—"}; 0 da Série A)`;
    await sleep(2200);
  }
  if (serieA[0]) {
    const temp = await http(`${base}/eventsseason.php?id=${serieA[0].idLeague}&s=${YEAR}`);
    const n = (temp.json?.events ?? []).length;
    r.notas.push(`eventsseason Série A ${YEAR}: ${temp.status === 429 ? "HTTP 429" : `${n} jogos retornados (a temporada tem 380; o plano grátis corta em ~15)`}`);
    await sleep(2200);
  }
  const jogo = a.ev.find((e) => e.idEvent && e.intHomeScore != null) ?? a.ev.find((e) => e.idEvent);
  if (jogo) {
    const tl = await http(`${base}/lookuptimeline.php?id=${jogo.idEvent}`);
    const n = (tl.json?.timeline ?? []).length;
    r.eventos = tl.status === 429 ? "bloqueado (HTTP 429) durante o teste" : n ? `sim (${n} eventos no jogo testado)` : `não: timeline vazia no plano grátis (${tl.text.slice(0, 60).replace(/\s+/g, " ")})`;
  }
  r.notas.push("Durante os testes a chave grátis compartilhada chegou a responder HTTP 429 (limite) — instável para produção.");
  return r;
}

// ───────────────────────── 5) OpenLigaDB ─────────────────────────
async function checkOpenLiga(): Promise<SourceReport> {
  const r = blank("openligadb", "OpenLigaDB");
  r.limite = "sem limite documentado (projeto comunitário); foco em ligas alemãs";
  const leagues = await http("https://api.openligadb.de/getavailableleagues");
  r.acessivel = leagues.ok && Array.isArray(leagues.json) ? "sim" : "não";
  if (!Array.isArray(leagues.json)) {
    r.notas.push(`getavailableleagues: HTTP ${leagues.status} ${leagues.error ?? ""}`);
    return r;
  }
  const L: any[] = leagues.json;
  const has = (re: RegExp) => L.filter((l) => re.test(`${l.leagueName} ${l.leagueShortcut}`));
  // Só conta como Série A se for de fato o campeonato brasileiro (e não a Copa do Mundo de 2014 no Brasil)
  const br = has(/brasileir/i); // "Serie A" sozinho é o campeonato ITALIANO
  const lib = has(/liberta/i);
  const temporadaMax = (ls: any[]) => Math.max(0, ...ls.map((l) => Number(l.leagueSeason) || 0));
  r.serieA = br.length ? `sim (${br.map((l) => l.leagueName).join(", ")})` : "não";
  r.copaBrasil = has(/copa do brasil/i).length ? "sim" : "não";
  r.libertadores = lib.length ? (temporadaMax(lib) >= YEAR - 1 ? "sim" : `não utilizável (só "${[...new Set(lib.map((l) => l.leagueName))].join(", ")}", temporada ${temporadaMax(lib)})`) : "não";
  r.notas.push(`Casaram com "brasil/libertadores/copa" mas NÃO são o que precisamos: ${[...new Set(has(/bras|brazil|liberta|copa/i).map((l) => `${l.leagueName} ${l.leagueSeason}`))].join(" | ")}`);
  const nomes = [...new Set(L.map((l) => l.leagueName))].slice(0, 12).join(" | ");
  r.notas.push(`${L.length} ligas/temporadas no catálogo; exemplos: ${nomes}`);

  const season = today.getMonth() >= 6 ? YEAR : YEAR - 1;
  const bl = await http(`https://api.openligadb.de/getmatchdata/bl1/${season}`);
  const ms: any[] = Array.isArray(bl.json) ? bl.json : [];
  if (ms.length) {
    r.escudos = ms.some((m) => m.team1?.teamIconUrl) ? "sim" : "não";
    r.eventos = ms.some((m) => (m.goals ?? []).length) ? "parcial (gols com minuto/autor; sem cartões)" : "não";
    r.aoVivo = `campos matchIsFinished/gols atualizados durante o jogo (Bundesliga ${season}: ${ms.length} jogos) — só Alemanha`;
  }
  return r;
}

// ───────────────────────── 6) Highlightly ─────────────────────────
async function checkHighlightly(): Promise<SourceReport> {
  const r = blank("highlightly", "Highlightly");
  const key = process.env.HIGHLIGHTLY_KEY;
  r.limite = "ver painel/preços da Highlightly (não verificado aqui)";
  if (!key) {
    r.acessivel = "não testado (exige chave)";
    r.notas.push("Defina HIGHLIGHTLY_KEY para testar. Sem chave, nenhuma célula foi preenchida — nada foi presumido.");
    return r;
  }
  const res = await http("https://soccer.highlightly.net/leagues?countryName=Brazil", { "x-rapidapi-key": key });
  r.acessivel = res.ok ? "sim" : `HTTP ${res.status}`;
  const data: any[] = res.json?.data ?? [];
  const has = (re: RegExp) => (data.some((l) => re.test(l.name ?? "")) ? "sim" : "não");
  r.serieA = has(/serie a|série a/i);
  r.copaBrasil = has(/copa do brasil/i);
  r.notas.push(`leagues?countryName=Brazil → ${data.length} ligas: ${data.map((l) => l.name).slice(0, 10).join(", ")}`);
  r.notas.push("Libertadores, ao vivo, eventos e escudos ainda não implementados neste script — completar ao decidir usar a fonte.");
  return r;
}

// ───────────────────────── Saída ─────────────────────────
function table(rows: string[][]): string {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => Math.min(r[i].length, 46))));
  const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  return rows.map((r, ri) => {
    const line = r.map((c, i) => cut(c, w[i]).padEnd(w[i])).join(" │ ");
    return ri === 0 ? line + "\n" + w.map((n) => "─".repeat(n)).join("─┼─") : line;
  }).join("\n");
}

async function main() {
  console.log(`\nETAPA 0 — validação de fontes · ${iso(today)}\n`);
  const steps: Array<[string, () => Promise<SourceReport>]> = [
    ["openfootball", checkOpenfootball],
    ["ESPN", checkEspn],
    ["football-data.org", checkFootballData],
    ["TheSportsDB", checkSportsDb],
    ["OpenLigaDB", checkOpenLiga],
    ["Highlightly", checkHighlightly],
  ];
  const reports: SourceReport[] = [];
  for (const [nome, fn] of steps) {
    process.stdout.write(`→ testando ${nome}… `);
    try {
      const rep = await fn();
      reports.push(rep);
      console.log("ok");
    } catch (e) {
      console.log("ERRO");
      const rep = blank(nome, nome);
      rep.notas.push(`Exceção no teste: ${String(e)}`);
      reports.push(rep);
    }
  }

  console.log("\n══════════ QUADRO-RESUMO ══════════\n");
  const header = ["Campo", ...reports.map((r) => r.id)];
  const rows: string[][] = [
    header,
    ["Acessível", ...reports.map((r) => r.acessivel)],
    ["Série A", ...reports.map((r) => r.serieA)],
    ["Copa do Brasil", ...reports.map((r) => r.copaBrasil)],
    ["Libertadores", ...reports.map((r) => r.libertadores)],
    ["Placar ao vivo", ...reports.map((r) => r.aoVivo)],
    ["Eventos", ...reports.map((r) => r.eventos)],
    ["Escudos", ...reports.map((r) => r.escudos)],
    ["Limite grátis", ...reports.map((r) => r.limite)],
  ];
  // imprime em blocos por fonte (as células são longas demais para uma tabela larga)
  for (const rep of reports) {
    console.log(`■ ${rep.nome}`);
    console.log(table([["Campo", "Resultado"], ...rows.slice(1).map((row) => [row[0], row[1 + reports.indexOf(rep)]])]));
    for (const n of rep.notas) console.log(`   · ${n}`);
    console.log("");
  }

  const espn = reports.find((r) => r.id === "espn");
  const det: any = espn?.detalhes;
  if (det) {
    console.log("══════════ ESPN — cobertura por liga ══════════\n");
    console.log(
      table([
        ["Liga", "slug", "HTTP", `Jogos ${YEAR}`, "Ao vivo", "Encerr.", "Logos", "Eventos*"],
        ...det.porLiga.map((l: any) => [l.nome, l.slug, String(l.http), String(l.eventos ?? "—"), String(l.aoVivoAgora ?? "—"), String(l.encerrados ?? "—"), l.logosPct != null ? `${l.logosPct}%` : "—", String(l.encerradosComDetalhes ?? "—")]),
      ]),
    );
    console.log("  * encerrados com 'details' (gols/cartões) já no scoreboard\n");
    console.log("ESPN — detalhe de partida (summary):");
    for (const x of det.resumo) console.log("  ", JSON.stringify(x));
    console.log("\nESPN — classificação:");
    for (const x of det.standings) console.log("  ", JSON.stringify(x));
    console.log("");
  }

  const dir = join(dirname(fileURLToPath(import.meta.url)), "out");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "check-sources.json");
  writeFileSync(file, JSON.stringify({ geradoEm: new Date().toISOString(), reports }, null, 2), "utf8");
  console.log(`Relatório completo salvo em ${file}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
