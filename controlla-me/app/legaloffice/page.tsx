export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import LegalOfficeClient from "./LegalOfficeClient";

export const metadata: Metadata = {
  title: "Legal Office — Poimandres",
  description:
    "Workspace professionale per l'analisi legale con 4 agenti AI specializzati.",
};

export default function LegalOfficePage() {
  return <LegalOfficeClient />;
}
