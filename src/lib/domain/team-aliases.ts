/**
 * Nomes de times que variam entre fontes. Cada entrada leva a chave-base do nome na fonte
 * ("mineiro", de "CA Mineiro" no openfootball) até a chave canônica — a que a ESPN (fonte
 * principal) usa — e o nome de exibição.
 *
 * Como foi montada: comparando, em 22/10/2026, os times de `openfootball` com os da ESPN
 * em Brasileirão A, Premier League, La Liga, Bundesliga, Serie A e Libertadores. Times que
 * só existem em um dos lados (rebaixados/promovidos) não precisam de alias.
 *
 * Para uma liga nova ou uma temporada nova: compare as chaves das duas fontes e acrescente
 * aqui o que não casar (o teste de integração do football-data imprime as diferenças).
 */
export interface TeamAlias {
  /** Chave canônica (a da ESPN). */
  key: string;
  /** Nome de exibição (o da ESPN). */
  name: string;
}

const A = (key: string, name: string): TeamAlias => ({ key, name });

/** Chave-base na fonte → time canônico. */
export const TEAM_ALIASES: Readonly<Record<string, TeamAlias>> = {
  // A própria ESPN chama o time 3458 de "Athletico-PR" no placar e "Athletico Paranaense" na tabela.
  "athletico-paranaense": A("athletico-pr", "Athletico-PR"),

  // Brasil (openfootball)
  mineiro: A("atletico-mg", "Atlético-MG"),
  paranaense: A("athletico-pr", "Athletico-PR"),
  bragantino: A("red-bull-bragantino", "Red Bull Bragantino"),
  "coritiba-fbc": A("coritiba", "Coritiba"),
  "do-remo": A("remo", "Remo"),
  "gremio-fbpa": A("gremio", "Grêmio"),
  "chapecoense-af": A("chapecoense", "Chapecoense"),
  "corinthians-paulista": A("corinthians", "Corinthians"),
  "botafogo-fr": A("botafogo", "Botafogo"),

  // Espanha
  "deportivo-alaves": A("alaves", "Alavés"),
  "rayo-vallecano-de-madrid": A("rayo-vallecano", "Rayo Vallecano"),
  "real-racing-club-de-santander": A("racing-santander", "Racing Santander"),
  "rcd-espanyol-de-barcelona": A("espanyol", "Espanyol"),
  "levante-ud": A("levante", "Levante"),
  "rc-deportivo-la-coruna": A("deportivo", "Deportivo"),
  "atletico-de-madrid": A("atletico-madrid", "Atlético Madrid"),
  "real-betis-balompie": A("real-betis", "Real Betis"),
  "real-sociedad-de-futbol": A("real-sociedad", "Real Sociedad"),
  "rc-celta-de-vigo": A("celta-vigo", "Celta Vigo"),

  // Alemanha
  "bayern-munchen": A("bayern-munich", "Bayern Munich"),
  "1-fsv-mainz-05": A("mainz", "Mainz"),
  "sv-07-elversberg": A("sv-elversberg", "SV Elversberg"),
  "bayer-04-leverkusen": A("bayer-leverkusen", "Bayer Leverkusen"),
  "1-fc-koln": A("cologne", "FC Cologne"),
  "tsg-1899-hoffenheim": A("tsg-hoffenheim", "TSG Hoffenheim"),
  "hamburger-sv": A("hamburg-sv", "Hamburg SV"),
  "sv-werder-bremen": A("werder-bremen", "Werder Bremen"),

  // Itália
  "udinese-calcio": A("udinese", "Udinese"),
  "como-1907": A("como", "Como"),
  "internazionale-milano": A("internazionale", "Internazionale"),
  "genoa-cfc": A("genoa", "Genoa"),
  "ssc-napoli": A("napoli", "Napoli"),
  "parma-calcio-1913": A("parma", "Parma"),
  "cagliari-calcio": A("cagliari", "Cagliari"),
  "frosinone-calcio": A("frosinone", "Frosinone"),
  "us-lecce": A("lecce", "Lecce"),
  "atalanta-bc": A("atalanta", "Atalanta"),
  "us-sassuolo-calcio": A("sassuolo", "Sassuolo"),
  "bologna-fc-1909": A("bologna", "Bologna"),
  "ss-lazio": A("lazio", "Lazio"),
  "acf-fiorentina": A("fiorentina", "Fiorentina"),

  // Libertadores
  "juventud-de-las-piedras": A("juventud", "Juventud"),
  cristal: A("sporting-cristal", "Sporting Cristal"),
  "aa-argentinos-juniors": A("argentinos-juniors", "Argentinos Juniors"),
  tolima: A("deportes-tolima", "Deportes Tolima"),
  "ldu-de-quito": A("liga-de-quito", "Liga de Quito"),
  "universitario-de-deportes": A("universitario", "Universitario"),
  "nacional-de-football": A("nacional", "Nacional"),
  "cdp-junior": A("atletico-junior", "Atlético Junior"),
  "universidad-central-de-venezuela": A("ucv", "UCV FC"),
  "libertad-asuncion": A("libertad", "Libertad"),
  "car-independiente-del-valle": A("independiente-del-valle", "Independiente del Valle"),
};
