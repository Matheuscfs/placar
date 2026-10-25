/**
 * Configuração central do servidor. Nada aqui chama a rede.
 * Variáveis de ambiente: ver `.env.example`.
 */

/** TTLs de cache em segundos. Jogos ao vivo curtos; calendário e tabelas longos. */
export const TTL = {
  /** Jogos em andamento: 15–30 s, conforme pedido. */
  live: 20,
  /** Lista de jogos do dia de hoje (contém jogos que podem começar/acabar). */
  today: 30,
  /** Dias passados: resultados não mudam mais. */
  pastDay: 6 * 60 * 60,
  /** Dias futuros: calendário muda pouco. */
  futureDay: 30 * 60,
  /** Detalhe de jogo ao vivo / encerrado. */
  matchLive: 20,
  matchScheduled: 2 * 60,
  matchFinished: 60 * 60,
  standings: 10 * 60,
  team: 30 * 60,
  /** Busca de times por nome: o catálogo de times quase não muda. */
  teamSearch: 6 * 60 * 60,
  leagues: 24 * 60 * 60,
  /** Consulta que a fonte respondeu "não existe": guardada pouco, para um id inválido repetido não gastar a cota. */
  notFound: 60,
} as const;

/**
 * Por quanto tempo, ALÉM do TTL, o último dado bom pode ser servido quando a fonte falha
 * (stale-if-error). Placar ao vivo velho engana, então a janela dele é curta.
 */
export const STALE = {
  live: 60,
  today: 5 * 60,
  pastDay: 24 * 60 * 60,
  futureDay: 6 * 60 * 60,
  matchLive: 60,
  matchScheduled: 30 * 60,
  matchFinished: 24 * 60 * 60,
  standings: 60 * 60,
  team: 6 * 60 * 60,
  teamSearch: 24 * 60 * 60,
} as const;

/** Disjuntor: após N falhas seguidas a fonte é pulada por um tempo (evita esperar timeouts a cada requisição). */
export const CIRCUIT = { failureThreshold: 3, cooldownSeconds: 30 } as const;

/** Teto de entradas do cache em memória (o mais antigo sai primeiro). */
export const CACHE_MAX_ENTRIES = 1000;

/** Quantos erros recentes o orquestrador guarda para diagnóstico. */
export const ERROR_LOG_SIZE = 50;

/** Datas aceitas pela API, em dias a partir de hoje: impede que um cliente force consultas ilimitadas às fontes. */
export const DATE_WINDOW_DAYS = { past: 60, future: 120 } as const;

/** Cota de requisições por fonte (janela deslizante). Fica abaixo do limite real. */
export const RATE_LIMITS = {
  espn: { max: 60, windowSeconds: 60 },
  // Plano grátis: 10 req/min.
  "football-data": { max: 8, windowSeconds: 60 },
  // CDN do GitHub; a API do GitHub (60/h sem token) não é usada em produção.
  openfootball: { max: 30, windowSeconds: 60 },
} as const;

/** Tempo máximo de espera por uma fonte antes de acionar o fallback. */
export const SOURCE_TIMEOUT_MS = 8_000;

/** Ordem de preferência das fontes. O orquestrador pula as que não cobrem a liga. */
export const SOURCE_PRIORITY = ["espn", "football-data", "openfootball"] as const;

export const env = {
  footballDataToken: process.env.FOOTBALL_DATA_TOKEN ?? "",
} as const;
