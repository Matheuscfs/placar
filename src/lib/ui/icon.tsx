import { ImageResponse } from "next/og";

export const BRAND_BLUE = "#2b50ff";

/**
 * Ícone do app: dois zeros brancos sobre cobalto — o placar zerado, antes do apito.
 * Desenhado só com formas (sem texto), então não depende de fonte. `maskable` deixa o desenho
 * dentro da zona segura central (o Android recorta as bordas) e pinta o fundo até as bordas.
 */
export function renderIcon(size: number, opts: { maskable?: boolean; rounded?: boolean } = {}): ImageResponse {
  const k = opts.maskable ? 0.82 : 1; // zona segura
  const ringW = Math.round(size * 0.2 * k);
  const ringH = Math.round(size * 0.37 * k);
  const stroke = Math.max(2, Math.round(size * 0.05 * k));
  const gap = Math.round(size * 0.05 * k);
  const dashW = Math.round(size * 0.07 * k);
  const dashH = Math.max(2, Math.round(size * 0.045 * k));
  const ring = { width: ringW, height: ringH, border: `${stroke}px solid #ffffff`, borderRadius: ringW } as const;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          background: BRAND_BLUE,
          borderRadius: opts.rounded ? Math.round(size * 0.22) : 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap,
        }}
      >
        <div style={{ ...ring, display: "flex" }} />
        <div style={{ width: dashW, height: dashH, background: "#ffffff", borderRadius: dashH, display: "flex" }} />
        <div style={{ ...ring, display: "flex" }} />
      </div>
    ),
    { width: size, height: size },
  );
}
