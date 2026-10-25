import { describe, expect, it } from "vitest";
import { ApiError, parseSearchQuery } from "./http";
import { MAX_SEARCH_LENGTH } from "./search";

describe("parseSearchQuery", () => {
  it("aceita de 2 a 60 caracteres e limpa espaços repetidos nas pontas e no meio", () => {
    expect(parseSearchQuery("  são   paulo ")).toBe("são paulo");
    expect(parseSearchQuery("ab")).toBe("ab");
    expect(parseSearchQuery("a".repeat(MAX_SEARCH_LENGTH))).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it.each([null, "", " ", "a", "  b  "])("recusa %j (curto demais) com 400", (raw) => {
    expect(() => parseSearchQuery(raw)).toThrow(ApiError);
    try {
      parseSearchQuery(raw);
    } catch (e) {
      expect((e as ApiError).status).toBe(400);
    }
  });

  it("recusa texto longo demais (a cota das fontes não é de graça)", () => {
    expect(() => parseSearchQuery("a".repeat(MAX_SEARCH_LENGTH + 1))).toThrow(/até 60/);
  });
});
