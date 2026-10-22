import { renderIcon } from "@/lib/ui/icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// O iOS aplica a própria máscara arredondada: o ícone vai de ponta a ponta.
export default function AppleIcon() {
  return renderIcon(180);
}
