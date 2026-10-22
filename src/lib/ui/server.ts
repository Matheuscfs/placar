import { cookies } from "next/headers";
import { DataSourceError } from "@/lib/data/errors";
import type { Favorites } from "./favorites";
import { FAVORITES_COOKIE, decodeFavoritesCookie } from "./favorites-cookie";
import type { Sourced } from "@/lib/domain/types";

export type Initial<T> = { ok: true; data: Sourced<T> } | { ok: false; reason: "not_found" | "failed" };

/**
 * Carrega os dados iniciais de uma página NO SERVIDOR, direto do orquestrador (a mesma camada que
 * a API usa, com o mesmo cache): a página já nasce com o conteúdo e a rede do navegador só entra
 * para atualizar. Se falhar, a página abre mesmo assim e o navegador tenta de novo pela API.
 *
 * "Não existe" (id que nenhuma fonte conhece) é separado de "falhou", para a página responder 404.
 */
export async function loadInitial<T>(fn: () => Promise<Sourced<T>>): Promise<Initial<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof DataSourceError && (e.kind === "not_found" || e.kind === "invalid_id" || e.kind === "unsupported")) return { ok: false, reason: "not_found" };
    return { ok: false, reason: "failed" };
  }
}

/** Favoritos que o cookie-espelho informa ao servidor: só para renderizar a 1ª pintura na ordem certa. */
export async function readSeedFavorites(): Promise<Favorites> {
  return decodeFavoritesCookie((await cookies()).get(FAVORITES_COOKIE)?.value);
}
