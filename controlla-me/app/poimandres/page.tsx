import type { Metadata } from "next";
import PoimandresLandingClient from "./PoimandresLandingClient";
import {
  generateWebsiteJsonLd,
  POIMANDRES_URL,
} from "@/lib/seo";

export const metadata: Metadata = {
  title: "poimandres — Analisi Legale AI e Legal Tech",
  description:
    "Guide pratiche, approfondimenti e strumenti AI per capire contratti, diritti dei lavoratori e tutela consumatori. Il tuo riferimento per la legal tech in Italia.",
  openGraph: {
    title: "poimandres — Analisi Legale AI e Legal Tech",
    description:
      "Guide pratiche, approfondimenti e strumenti AI per capire contratti, diritti e tutela legale in Italia.",
    type: "website",
    url: POIMANDRES_URL,
    siteName: "poimandres",
  },
  alternates: {
    canonical: POIMANDRES_URL,
  },
};

function WebsiteJsonLd() {
  const jsonLd = generateWebsiteJsonLd(
    "poimandres",
    POIMANDRES_URL,
    "Guide, approfondimenti e strumenti AI per l'analisi legale in Italia.",
  );

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function PoimandresPage() {
  return (
    <>
      <WebsiteJsonLd />
      <PoimandresLandingClient />
    </>
  );
}
