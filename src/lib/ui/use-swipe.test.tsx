// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SWIPE, swipeDirection, useSwipe, type SwipePoint } from "./use-swipe";

afterEach(cleanup);

const p = (x: number, y: number, t = 0): SwipePoint => ({ x, y, t });

describe("swipeDirection", () => {
  it("arrastar comprido e horizontal: esquerda e direita", () => {
    expect(swipeDirection(p(300, 100), p(150, 105, 200))).toBe("left");
    expect(swipeDirection(p(100, 100), p(260, 90, 200))).toBe("right");
  });

  it("curto demais não vale (toque, tremida)", () => {
    expect(swipeDirection(p(100, 100), p(100 + SWIPE.minDistance - 1, 100, 100))).toBeNull();
    expect(swipeDirection(p(100, 100), p(100, 100, 100))).toBeNull();
  });

  it("no limite exato da distância já vale", () => {
    expect(swipeDirection(p(200, 100), p(200 - SWIPE.minDistance, 100, 100))).toBe("left");
  });

  it("rolar a página (movimento mais vertical que horizontal) NÃO vale", () => {
    expect(swipeDirection(p(100, 100), p(190, 400, 200))).toBeNull();
    // 100 de lado e 60 para baixo: horizontal, mas não 2x mais horizontal que vertical
    expect(swipeDirection(p(100, 100), p(200, 160, 200))).toBeNull();
    expect(swipeDirection(p(100, 100), p(200, 150, 200))).toBe("right"); // exatamente 2x
  });

  it("lento demais (segurar e passear o dedo) não vale", () => {
    expect(swipeDirection(p(300, 100), p(100, 100, SWIPE.maxDuration + 1))).toBeNull();
    expect(swipeDirection(p(300, 100), p(100, 100, SWIPE.maxDuration))).toBe("left");
  });
});

/** O jsdom não tem `Touch`: monta o evento à mão com as listas que o React lê. */
function touch(el: Element, type: "touchstart" | "touchend" | "touchcancel", x: number, y: number) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const list = [{ clientX: x, clientY: y }];
  Object.defineProperty(ev, "touches", { value: type === "touchend" || type === "touchcancel" ? [] : list });
  Object.defineProperty(ev, "changedTouches", { value: list });
  el.dispatchEvent(ev);
}

function Harness({ onLeft, onRight }: { onLeft: () => void; onRight: () => void }) {
  const swipe = useSwipe({ onLeft, onRight });
  return (
    <div data-testid="area" {...swipe}>
      <p data-testid="texto">texto</p>
      <input data-testid="campo" />
      <nav data-testid="faixa">
        <button type="button">dia</button>
      </nav>
      <div data-no-swipe data-testid="protegido">
        <span data-testid="dentro">dentro</span>
      </div>
    </div>
  );
}

describe("useSwipe", () => {
  const setup = () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    render(<Harness onLeft={onLeft} onRight={onRight} />);
    return { onLeft, onRight, area: screen.getByTestId("area"), texto: screen.getByTestId("texto") };
  };

  it("arrastar para a esquerda chama onLeft; para a direita, onRight", () => {
    const { onLeft, onRight, texto } = setup();
    touch(texto, "touchstart", 300, 200);
    touch(texto, "touchend", 120, 205);
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onRight).not.toHaveBeenCalled();

    touch(texto, "touchstart", 100, 200);
    touch(texto, "touchend", 280, 190);
    expect(onRight).toHaveBeenCalledTimes(1);
  });

  it("gesto vertical (rolagem) não chama nada", () => {
    const { onLeft, onRight, texto } = setup();
    touch(texto, "touchstart", 200, 100);
    touch(texto, "touchend", 215, 500);
    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("ignora gestos que começam em campo de texto, faixa rolável (nav) ou área protegida", () => {
    const { onLeft, onRight } = setup();
    for (const id of ["campo", "faixa", "dentro", "protegido"]) {
      const el = screen.getByTestId(id);
      touch(el, "touchstart", 300, 200);
      touch(el, "touchend", 100, 200);
    }
    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("toque cancelado apaga o gesto: o fim seguinte, sem começo, não conta", () => {
    const { onLeft, texto } = setup();
    touch(texto, "touchstart", 300, 200);
    touch(texto, "touchcancel", 300, 200);
    touch(texto, "touchend", 100, 200);
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("um gesto só vale uma vez (o fim sem novo começo não repete)", () => {
    const { onLeft, texto } = setup();
    touch(texto, "touchstart", 300, 200);
    touch(texto, "touchend", 100, 200);
    touch(texto, "touchend", 100, 200);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it("sem os callbacks, não quebra", () => {
    function Bare() {
      const s = useSwipe({});
      return (
        <div data-testid="bare" {...s}>
          x
        </div>
      );
    }
    render(<Bare />);
    const el = screen.getByTestId("bare");
    expect(() => {
      touch(el, "touchstart", 300, 200);
      touch(el, "touchend", 100, 200);
    }).not.toThrow();
  });
});
