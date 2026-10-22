import { DataSourceError } from "@/lib/data/errors";
import { SOURCE_IDS, type SourceId } from "./types";

/**
 * Ids qualificados: `<fonte>:<parte>[:<parte>…]`.
 * Ex.: partida ESPN `espn:bra.1:748392`, time ESPN `espn:819`.
 * O prefixo diz a qual conector o id pertence; as partes são opacas para o resto do app.
 */
export function makeId(source: SourceId, ...parts: Array<string | number>): string {
  if (parts.length === 0) throw new Error("makeId precisa de ao menos uma parte");
  const clean = parts.map(String);
  if (clean.some((p) => p === "" || p.includes(":"))) throw new Error(`Parte de id inválida: ${JSON.stringify(clean)}`);
  return [source, ...clean].join(":");
}

export interface ParsedId {
  source: SourceId;
  parts: string[];
}

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value);
}

export function parseId(id: string): ParsedId {
  const [source, ...parts] = id.split(":");
  if (!isSourceId(source) || parts.length === 0 || parts.some((p) => p === "")) {
    throw new DataSourceError("invalid_id", `Id inválido: "${id}"`);
  }
  return { source, parts };
}
