import type { Metadata } from "next";
import AffittiLandingClient from "./AffittiLandingClient";

export const metadata: Metadata = {
  title: "Analisi Contratto di Affitto | controlla.me",
  description:
    "Carica il tuo contratto di affitto e scopri in 30 secondi se contiene clausole illegali, penali eccessive o vincoli nascosti. Analisi AI gratuita.",
  openGraph: {
    title: "Contratto di affitto: scopri le clausole illegali in 30 secondi",
    description:
      "4 agenti AI analizzano il tuo contratto di locazione. Clausole vietate, diritti del conduttore, norme di riferimento.",
    type: "website",
  },
  keywords: [
    "contratto affitto analisi",
    "clausole illegali contratto locazione",
    "contratto affitto clausole vietate",
    "diritti inquilino",
    "analisi contratto locazione AI",
    "controlla.me affitti",
  ],
};

export default function AffittiPage() {
  return <AffittiLandingClient />;
}
