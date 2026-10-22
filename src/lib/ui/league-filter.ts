import type { LeagueId } from "@/lib/domain/types";

/**
 * Filtro de campeonatos do dia, compartilhado entre a tela inicial (que sabe quais campeonatos têm jogo e
 * aplica o filtro) e o trilho lateral (que mostra as caixas de seleção). Fica só em memória: vale enquanto
 * a página está aberta. Armazenamento externo para `useSyncExternalStore`: o objeto só é trocado quando algo muda.
 */
export interface DayLeague {
  id: LeagueId;
  name: string;
  total: number;
}

export interface LeagueFilterState {
  /** Campeonatos com jogo no dia que a tela inicial mostra agora. */
  leagues: readonly DayLeague[];
  /** Campeonatos que a pessoa desmarcou. */
  off: readonly LeagueId[];
}

const EMPTY: LeagueFilterState = Object.freeze({ leagues: [], off: [] }) as LeagueFilterState;
let state: LeagueFilterState = EMPTY;
const listeners = new Set<() => void>();

const set = (next: LeagueFilterState) => {
  state = next;
  for (const l of listeners) l();
};

export const getLeagueFilterSnapshot = (): LeagueFilterState => state;
export const getServerLeagueFilterSnapshot = (): LeagueFilterState => EMPTY;

export function subscribeLeagueFilter(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
}

const sameLeagues = (a: readonly DayLeague[], b: readonly DayLeague[]) => a.length === b.length && a.every((x, i) => x.id === b[i].id && x.total === b[i].total && x.name === b[i].name);

/** A tela inicial informa quais campeonatos têm jogo no dia. Só notifica se a lista mudou de fato. */
export function publishDayLeagues(leagues: readonly DayLeague[]): void {
  if (sameLeagues(state.leagues, leagues)) return;
  set({ ...state, leagues });
}

export function toggleLeagueOff(id: LeagueId): void {
  set({ ...state, off: state.off.includes(id) ? state.off.filter((x) => x !== id) : [...state.off, id] });
}

export function showAllLeagues(): void {
  if (state.off.length > 0) set({ ...state, off: [] });
}

/** Só para testes. */
export function resetLeagueFilter(): void {
  state = EMPTY;
  listeners.clear();
}
