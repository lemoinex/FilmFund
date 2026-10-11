import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";

import { Actualisation } from "@/components/actualisation";
import { versionDuBuild } from "@/lib/actualisation";
import { COULEUR_APPLICATION, ICONE_APPLE, NOM_APPLICATION } from "@/lib/installation";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Serif editoriale reservee aux titres : presence forte, rendu cinematographique.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FilmFund Africa — Développement de projets cinématographiques africains",
  description:
    "FilmFund Africa est une plateforme de développement et de structuration de projets cinématographiques et audiovisuels africains : écriture, documents professionnels, préproduction et gestion de projet.",
  keywords: [
    "cinéma africain",
    "développement de projets cinématographiques",
    "production audiovisuelle",
    "développement de scénario",
    "préproduction",
    "storyboard",
  ],
  openGraph: {
    title: "FilmFund Africa",
    description:
      "Un espace de travail structuré pour développer et préparer vos projets cinématographiques et audiovisuels africains.",
    locale: "fr_FR",
    type: "website",
  },
  // Installation : le manifest est servi par `app/manifest.ts`, Next le relie seul.
  applicationName: NOM_APPLICATION,
  appleWebApp: { capable: true, title: NOM_APPLICATION, statusBarStyle: "black-translucent" },
  icons: { apple: ICONE_APPLE },
};

export const viewport: Viewport = {
  themeColor: COULEUR_APPLICATION,
};

// Props typees explicitement plutot que via le type global `LayoutProps` : celui-ci
// n'est genere qu'au build, ce qui casse `npm run typecheck` sur une CI fraiche.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="bg-navy text-light flex min-h-full flex-col">
        {children}
        {/* La version est celle du build qui rend cette page : elle ne bouge plus tant que la fenêtre reste ouverte. */}
        <Actualisation version={versionDuBuild()} />
      </body>
    </html>
  );
}
