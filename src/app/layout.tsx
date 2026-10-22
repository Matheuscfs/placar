import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { AppFooter } from "@/components/app-footer";
import { AppHeader } from "@/components/app-header";
import { AppRail } from "@/components/app-rail";
import { TabBar } from "@/components/tab-bar";
import { isEsportsConfigured } from "@/lib/esports/service";
import { FavoritesCookieSync } from "@/components/favorites-cookie-sync";
import { OfflineBanner } from "@/components/offline-banner";
import { RegisterServiceWorker } from "@/components/register-sw";
import { THEME_INIT_SCRIPT } from "@/lib/ui/theme";
import "./globals.css";

// Uma família só. O eixo de largura (`wdth`) serve ao placar: dígitos expandidos, como numa placa de estádio.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Placar — futebol ao vivo", template: "%s — Placar" },
  description: "Placares de futebol ao vivo, jogos do dia e classificação, sem ruído.",
  applicationName: "Placar",
  appleWebApp: { capable: true, title: "Placar", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#12151c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const esports = isEsportsConfigured();
  return (
    // suppressHydrationWarning: o script do <head> põe `data-theme` no <html> antes do React hidratar.
    <html lang="pt-BR" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a href="#conteudo" className="skip-link">
          Ir para o conteúdo
        </a>
        {/* Trilho lateral a partir de 768 px; no celular, cabeçalho enxuto em cima e barra de seções embaixo. */}
        <div className="min-[768px]:flex">
          <AppRail esports={esports} />
          <div className="min-w-0 flex-1">
            <AppHeader />
            <OfflineBanner />
            <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-[40rem] px-5 outline-none">
              {children}
            </main>
            <AppFooter />
          </div>
        </div>
        <TabBar esports={esports} />
        <RegisterServiceWorker />
        <FavoritesCookieSync />
      </body>
    </html>
  );
}
