// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "@/components/share-button";
import { legacyCopy, matchShareText, shareLink } from "./share";

const data = { title: "Flamengo x Estudiantes — Placar", text: "Flamengo x Estudiantes", url: "https://placar.example/jogo/1" };
const abort = () => Object.assign(new Error("cancelado"), { name: "AbortError" });

describe("matchShareText", () => {
  const side = (name: string, score: number | null) => ({ team: { id: "x", key: name, name, shortName: name, abbr: name }, score, penalties: null, aggregate: null });
  it("com placar e sem placar", () => {
    expect(matchShareText({ home: side("Corinthians", 2), away: side("Vitória", 1) })).toBe("Corinthians 2 x 1 Vitória");
    expect(matchShareText({ home: side("Corinthians", null), away: side("Vitória", null) })).toBe("Corinthians x Vitória");
    expect(matchShareText({ home: side("Corinthians", 0), away: side("Vitória", 0) })).toBe("Corinthians 0 x 0 Vitória");
  });
});

describe("shareLink", () => {
  it("usa a folha de compartilhamento do aparelho quando existe", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    expect(await shareLink(data, { share, writeText })).toBe("shared");
    expect(share).toHaveBeenCalledWith(data);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("fechar a folha sem escolher nada NÃO é erro e não copia o link", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await shareLink(data, { share: async () => Promise.reject(abort()), writeText })).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("a folha falhou por outro motivo: copia o link em vez de desistir", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await shareLink(data, { share: async () => Promise.reject(new Error("sem permissão")), writeText })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it("o aparelho não aceita compartilhar esses dados (canShare falso): copia", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    expect(await shareLink(data, { share, canShare: () => false, writeText })).toBe("copied");
    expect(share).not.toHaveBeenCalled();
  });

  it("sem folha de compartilhamento (computador): copia o link", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await shareLink(data, { writeText })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(data.url);
  });

  it("copiar falhou, ou não há como copiar: 'failed'", async () => {
    expect(await shareLink(data, { writeText: async () => Promise.reject(new Error("bloqueado")) })).toBe("failed");
    expect(await shareLink(data, {})).toBe("failed");
  });
});

describe("ShareButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "clipboard");
    Reflect.deleteProperty(navigator, "share");
  });

  it("no computador: copia o link da página, avisa 'Link copiado' e o aviso some sozinho", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ShareButton title="t" text="x" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Compartilhar/ }));
    });
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.getByRole("status")).toHaveTextContent("Link copiado");
    await act(async () => void (await vi.advanceTimersByTimeAsync(2600)));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("no celular: abre a folha do sistema e não mostra aviso", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    render(<ShareButton title="Jogo — Placar" text="A x B" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Compartilhar/ }));
    });
    expect(share).toHaveBeenCalledWith({ title: "Jogo — Placar", text: "A x B", url: window.location.href });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("sem como compartilhar nem copiar: diz que não deu", async () => {
    render(<ShareButton title="t" text="x" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Compartilhar/ }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Não deu para compartilhar");
  });
});

describe("plano B de copiar (execCommand)", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "execCommand");
    Reflect.deleteProperty(navigator, "clipboard");
    cleanup();
  });
  const setExec = (impl: () => boolean) => {
    const spy = vi.fn(impl);
    Object.defineProperty(document, "execCommand", { configurable: true, value: spy });
    return spy;
  };

  it("copia o texto por um campo temporário e o remove depois", () => {
    const exec = setExec(() => true);
    legacyCopy("https://placar.example/jogo/1");
    expect(exec).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("o navegador recusou: lança, e mesmo assim não deixa o campo temporário na página", () => {
    setExec(() => false);
    expect(() => legacyCopy("x")).toThrow(/recusou/);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("sem execCommand: lança", () => {
    expect(() => legacyCopy("x")).toThrow();
  });

  it("a API moderna é recusada (permissão): o botão copia pelo plano B e diz 'Link copiado'", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => Promise.reject(new Error("NotAllowedError"))) } });
    const exec = setExec(() => true);
    render(<ShareButton title="t" text="x" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Compartilhar/ }));
    });
    expect(exec).toHaveBeenCalledWith("copy");
    expect(screen.getByRole("status")).toHaveTextContent("Link copiado");
    vi.useRealTimers();
  });

  it("nenhum dos dois funciona: 'Não deu para compartilhar'", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => Promise.reject(new Error("x"))) } });
    setExec(() => false);
    render(<ShareButton title="t" text="x" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Compartilhar/ }));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Não deu para compartilhar");
    vi.useRealTimers();
  });
});
