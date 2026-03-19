import type { Metadata } from "next";

/**
 * Layout per poimandres.work — SEO content publishing.
 *
 * Questo layout NON include il root layout (html/body/fonts),
 * perche e un layout annidato sotto app/layout.tsx.
 * Fornisce metadata specifici per il dominio poimandres.work.
 */

export const metadata: Metadata = {
  metadataBase: new URL("https://poimandres.work"),
  title: {
    default: "poimandres — Analisi Legale AI e Legal Tech",
    template: "%s — poimandres",
  },
  description:
    "Guide, approfondimenti e strumenti AI per l'analisi legale: diritto dei contratti, tutela consumatori, diritto del lavoro. Powered by controlla.me.",
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: "poimandres",
    url: "https://poimandres.work",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://poimandres.work",
  },
};

export default function PoimandresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
