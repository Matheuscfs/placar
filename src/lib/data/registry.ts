import { SOURCE_PRIORITY } from "@/lib/config";
import type { DataSource } from "@/lib/data/data-source";
import { Orchestrator } from "@/lib/data/orchestrator";
import { EspnSource } from "@/lib/data/sources/espn";
import { FootballDataSource } from "@/lib/data/sources/football-data";
import { OpenFootballSource } from "@/lib/data/sources/openfootball";
import type { SourceId } from "@/lib/domain/types";

/** Orquestrador de produção: as 3 fontes, na ordem de `SOURCE_PRIORITY`. */
export function createDefaultOrchestrator(): Orchestrator {
  const all: Record<SourceId, () => DataSource> = {
    espn: () => new EspnSource(),
    "football-data": () => new FootballDataSource(),
    openfootball: () => new OpenFootballSource(),
  };
  return new Orchestrator({ sources: SOURCE_PRIORITY.map((id) => all[id]()) });
}

// Em `next dev` os módulos são recarregados a cada alteração; sem isto o cache, a cota e o
// disjuntor seriam zerados toda vez. Em produção é só um singleton por instância da função.
const KEY = Symbol.for("placar.orchestrator");
type Holder = { [KEY]?: Orchestrator };

export function getOrchestrator(): Orchestrator {
  const g = globalThis as Holder;
  return (g[KEY] ??= createDefaultOrchestrator());
}

/** Só para testes: troca (ou limpa, com `null`) o orquestrador global. */
export function setOrchestratorForTests(orchestrator: Orchestrator | null): void {
  const g = globalThis as Holder;
  if (orchestrator) g[KEY] = orchestrator;
  else delete g[KEY];
}
