import { ImageResponse } from "next/og";
import { BRAND_BLUE } from "@/lib/ui/icon";

export const alt = "Placar — futebol ao vivo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Imagem de compartilhamento (WhatsApp, X, Facebook…): a marca e o placar zerado, antes do apito. */
export default function OpenGraphImage() {
  const ring = { width: 90, height: 165, border: "11px solid #ffffff", borderRadius: 90, display: "flex" } as const;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#12151c", color: "#f2f3f5", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div style={{ ...ring }} />
          <div style={{ width: 44, height: 18, background: BRAND_BLUE, borderRadius: 18, display: "flex" }} />
          <div style={{ ...ring }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 132, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>
            placar
            <div style={{ width: 28, height: 28, borderRadius: 28, background: BRAND_BLUE, marginLeft: 8, display: "flex" }} />
          </div>
          <div style={{ fontSize: 40, color: "#a0a6b1", display: "flex" }}>Futebol ao vivo, jogos do dia e classificação.</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
