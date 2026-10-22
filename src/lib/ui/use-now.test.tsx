// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetNowStores, useNow } from "./use-now";

function Clock({ every = 1000 }: { every?: number }) {
  const now = useNow(every);
  return <p data-testid="t">{now === null ? "servidor" : String(now)}</p>;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-22T15:00:00Z") });
});
afterEach(() => {
  cleanup();
  resetNowStores();
  vi.useRealTimers();
});

describe("useNow", () => {
  it("renderiza sem entrar em loop (regressão: subscribe instável causava 'Maximum update depth exceeded')", () => {
    expect(() => render(<Clock />)).not.toThrow();
    expect(screen.getByTestId("t").textContent).not.toBe("servidor"); // no cliente já tem o instante
  });

  it("avança a cada intervalo, e só então", () => {
    render(<Clock every={1000} />);
    const first = Number(screen.getByTestId("t").textContent);
    act(() => void vi.advanceTimersByTime(500));
    expect(Number(screen.getByTestId("t").textContent)).toBe(first);
    act(() => void vi.advanceTimersByTime(600));
    expect(Number(screen.getByTestId("t").textContent)).toBe(first + 1000); // o relógio mostra o instante em que o timer disparou
  });

  it("vários componentes compartilham UM timer por intervalo", () => {
    const spy = vi.spyOn(window, "setInterval");
    render(
      <>
        <Clock every={5000} />
        <Clock every={5000} />
        <Clock every={5000} />
      </>,
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("para o timer quando o último componente sai da tela", () => {
    const clear = vi.spyOn(window, "clearInterval");
    const { unmount } = render(<Clock />);
    unmount();
    expect(clear).toHaveBeenCalled();
  });

  it("re-renderizar o pai não reassina (a assinatura é estável)", () => {
    const spy = vi.spyOn(window, "setInterval");
    const { rerender } = render(<Clock />);
    for (let i = 0; i < 5; i++) rerender(<Clock />);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
