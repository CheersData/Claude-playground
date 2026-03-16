// Server component wrapper — export const dynamic only works in server components
// since Next.js 16 Turbopack ignores route segment config in "use client" files.

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Integrazioni — controlla.me",
  description:
    "Collega CRM, ERP, cloud storage e strumenti legali. I connettori portano i dati dentro controlla.me, dove gli agenti AI li analizzano automaticamente.",
  openGraph: {
    title: "Marketplace Integrazioni — controlla.me",
    description:
      "Centralizza i tuoi dati aziendali con i connettori controlla.me. Setup guidato dall'AI, sync automatico, analisi intelligente.",
    type: "website",
  },
};

import IntegrazioneClient from "./IntegrazioneClient";

export default function IntegrazionePage() {
  return <IntegrazioneClient />;
}
