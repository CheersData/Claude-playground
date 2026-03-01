import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analisi contratto affitto AI — controlla.me",
  description:
    "Carica il tuo contratto di affitto. L'AI lo analizza in 60 secondi: trova clausole illegali, depositi fuori norma e trappole contrattuali. Gratis.",
  keywords: [
    "analisi contratto affitto AI",
    "contratto locazione illegale",
    "clausole affitto irregolari",
    "deposito cauzionale massimo legge",
    "diritti inquilino",
    "analisi contratto AI",
    "controlla contratto affitto",
  ],
  openGraph: {
    title: "Il tuo contratto di affitto è legale? Scoprilo con l'AI",
    description:
      "4 agenti AI analizzano ogni clausola del tuo contratto di locazione. Clausole illegali, depositi fuori norma, ISTAT irregolare. Report in 60 secondi.",
    type: "website",
    url: "https://controlla.me/affitti",
  },
  twitter: {
    card: "summary_large_image",
    title: "Analisi contratto affitto AI — controlla.me",
    description:
      "Scopri se il tuo contratto di affitto ha clausole illegali. Analisi AI in 60 secondi.",
  },
  alternates: {
    canonical: "https://controlla.me/affitti",
  },
};

export default function AffittiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
