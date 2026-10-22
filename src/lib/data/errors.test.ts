import { describe, expect, it, vi } from "vitest";
import { errorResponse } from "@/lib/api/http";
import { loadInitial } from "@/lib/ui/server";
import { AllSourcesFailedError, DataSourceError, isAllSourcesFailedError, isDataSourceError, isLocalQuotaError, LocalQuotaError } from "./errors";

// `next/headers` só funciona dentro de uma requisição; aqui só testamos `loadInitial`.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

/**
 * Cópias "de outro pacote": o mesmo módulo pode ser empacotado duas vezes (rotas e páginas), e o erro criado por uma
 * cópia da classe não é `instanceof` da outra. Estas classes têm o formato certo, mas NÃO herdam das nossas.
 */
class ForeignDataSourceError extends Error {
  kind: string;
  source: string | null = null;
  status: number | null = null;
  constructor(kind: string, message = "x") {
    super(message);
    this.name = "DataSourceError";
    this.kind = kind;
  }
}
class ForeignAllFailed extends ForeignDataSourceError {
  failures = [{ source: "espn", kind: "unavailable", message: "caiu" }];
  constructor() {
    super("unavailable", "todas");
    this.name = "AllSourcesFailedError";
  }
}
class ForeignQuota extends ForeignDataSourceError {
  retryAfterSeconds = 42;
  constructor() {
    super("rate_limited", "cota");
    this.name = "LocalQuotaError";
  }
}

describe("reconhecer erros de fonte de outra cópia do módulo", () => {
  it("os nossos continuam reconhecidos", () => {
    expect(isDataSourceError(new DataSourceError("not_found", "x"))).toBe(true);
    expect(isAllSourcesFailedError(new AllSourcesFailedError("x", []))).toBe(true);
    expect(isLocalQuotaError(new LocalQuotaError("espn", 3))).toBe(true);
  });

  it("os de outra cópia, com o mesmo formato, também", () => {
    expect(isDataSourceError(new ForeignDataSourceError("unsupported"))).toBe(true);
    expect(isAllSourcesFailedError(new ForeignAllFailed())).toBe(true);
    expect(isLocalQuotaError(new ForeignQuota())).toBe(true);
  });

  it("não confunde com erro comum, com 'kind' desconhecido, com objeto solto ou com o tipo errado de subclasse", () => {
    expect(isDataSourceError(new Error("x"))).toBe(false);
    expect(isDataSourceError(new ForeignDataSourceError("explodiu"))).toBe(false);
    expect(isDataSourceError({ kind: "not_found", source: null, status: null })).toBe(false); // não é Error
    expect(isDataSourceError(null)).toBe(false);
    expect(isDataSourceError(undefined)).toBe(false);
    expect(isDataSourceError("not_found")).toBe(false);
    expect(isAllSourcesFailedError(new ForeignDataSourceError("unavailable"))).toBe(false);
    expect(isLocalQuotaError(new ForeignDataSourceError("rate_limited"))).toBe(false);
  });
});

describe("loadInitial com erro de outra cópia do módulo", () => {
  const failing = (e: unknown) => loadInitial(async () => Promise.reject(e));

  it("'não existe', 'id inválido' e 'não suportado' viram not_found (a página responde 404 ou explica)", async () => {
    for (const kind of ["not_found", "invalid_id", "unsupported"]) {
      expect(await failing(new ForeignDataSourceError(kind)), kind).toEqual({ ok: false, reason: "not_found" });
      expect(await failing(new DataSourceError(kind as "not_found", "x")), kind).toEqual({ ok: false, reason: "not_found" });
    }
  });

  it("falha de verdade continua sendo 'failed'", async () => {
    expect(await failing(new ForeignDataSourceError("unavailable"))).toEqual({ ok: false, reason: "failed" });
    expect(await failing(new ForeignAllFailed())).toEqual({ ok: false, reason: "failed" });
    expect(await failing(new Error("boom"))).toEqual({ ok: false, reason: "failed" });
  });
});

describe("errorResponse com erro de outra cópia do módulo", () => {
  const status = (e: unknown) => errorResponse(e).status;
  it("mesmo mapeamento HTTP que o dos nossos erros", async () => {
    expect(status(new ForeignDataSourceError("not_found"))).toBe(404);
    expect(status(new ForeignDataSourceError("unsupported"))).toBe(404);
    expect(status(new ForeignDataSourceError("invalid_id"))).toBe(400);
    expect(status(new ForeignDataSourceError("timeout"))).toBe(503);
    const all = errorResponse(new ForeignAllFailed());
    expect(all.status).toBe(503);
    expect((await all.json()).error.code).toBe("all_sources_failed");
    expect(errorResponse(new ForeignQuota()).headers.get("retry-after")).toBe("42");
  });

  it("erro qualquer continua virando 500 genérico", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = errorResponse(new Error("segredo interno"));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("segredo interno");
    log.mockRestore();
  });
});
