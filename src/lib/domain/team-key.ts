import { TEAM_ALIASES } from "./team-aliases";

/**
 * Chave estável de time entre fontes. "SE Palmeiras" (openfootball) e "Palmeiras" (ESPN)
 * viram ambos "palmeiras". Favoritos são guardados por esta chave.
 *
 * Dois passos: (1) limpeza genérica — acentos, "(BRA)", siglas societárias nas pontas
 * ("FC", "EC", "SE", "CR"…); (2) `TEAM_ALIASES`, para nomes que não seguem esse padrão
 * (openfootball chama o Atlético-MG de "CA Mineiro").
 */
const EDGE_TOKENS = new Set([
  "fc", "ec", "sc", "se", "cr", "ca", "cd", "cf", "ad", "ac", "afc", "rb", "fk", "sk", "cs", "club", "clube", "futebol", "esporte",
]);

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Chave sem aliases (é a que `TEAM_ALIASES` usa como origem). */
export function baseTeamKey(name: string): string {
  const tokens = plain(name)
    .replace(/\([^)]*\)/g, " ") // "(BRA)", "(URU)"
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (tokens.length > 1 && EDGE_TOKENS.has(tokens[0])) tokens.shift();
  while (tokens.length > 1 && EDGE_TOKENS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join("-");
}

export function normalizeTeamKey(name: string): string {
  const base = baseTeamKey(name);
  return TEAM_ALIASES[base]?.key ?? base;
}

/**
 * Nome canônico quando o time tem alias ("Athletico Paranaense" → "Athletico-PR"); senão devolve
 * o nome como veio. Não mexe em siglas societárias: serve a fontes que já trazem nomes bons (ESPN).
 */
export function canonicalTeamName(name: string): string {
  return TEAM_ALIASES[baseTeamKey(name)]?.name ?? name;
}

/** Sigla de 3 letras a partir do nome, para fontes que não têm siglas. */
export function deriveAbbr(name: string): string {
  const letters = plain(name).replace(/[^a-z]/g, "");
  return (letters.slice(0, 3) || name.slice(0, 3)).toUpperCase();
}

/**
 * Nome para exibir a partir do nome cru de uma fonte sem nomes amigáveis (openfootball):
 * "SE Palmeiras" → "Palmeiras", "Club The Strongest (BOL)" → "The Strongest". Times com
 * alias usam o nome canônico ("CA Mineiro" → "Atlético-MG").
 */
export function teamDisplayName(raw: string): string {
  const alias = TEAM_ALIASES[baseTeamKey(raw)];
  if (alias) return alias.name;
  const tokens = raw.replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean);
  const isEdge = (t: string) => EDGE_TOKENS.has(plain(t).replace(/[^a-z0-9]/g, ""));
  while (tokens.length > 1 && isEdge(tokens[0])) tokens.shift();
  while (tokens.length > 1 && isEdge(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}
