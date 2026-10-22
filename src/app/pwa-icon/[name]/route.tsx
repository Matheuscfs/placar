import { renderIcon } from "@/lib/ui/icon";

export const dynamic = "force-static";

/** Ícones do manifesto: `/pwa-icon/192`, `/pwa-icon/512` e `/pwa-icon/maskable-512` (PNG gerado no build). */
const ICONS = {
  "192": () => renderIcon(192, { rounded: true }),
  "512": () => renderIcon(512, { rounded: true }),
  "maskable-512": () => renderIcon(512, { maskable: true }),
} as const;

export function generateStaticParams() {
  return Object.keys(ICONS).map((name) => ({ name }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const make = (ICONS as Record<string, (() => Response) | undefined>)[name];
  if (!make) return new Response("Não encontrado", { status: 404 });
  return make();
}
