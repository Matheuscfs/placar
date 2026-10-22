/** Largura a partir da qual a lista e o detalhe do jogo ficam lado a lado (o mesmo `min-[768px]` do CSS). */
export const SPLIT_QUERY = "(min-width: 768px)";

/** Largura a partir da qual o menu mostra os nomes e o modo painel fica disponível. */
export const XL_QUERY = "(min-width: 1200px)";

/** A tela comporta lista + detalhe lado a lado? Em ambiente sem `matchMedia` (testes, servidor) responde que não. */
export function canSplit(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.(SPLIT_QUERY).matches === true;
  } catch {
    return false;
  }
}
