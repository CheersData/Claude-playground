"use client";

import { use } from "react";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ResultsView from "@/components/ResultsView";
import type { AdvisorResult } from "@/lib/types";

// In production, this would fetch from Supabase
const MOCK_RESULT: AdvisorResult = {
  fairnessScore: 6.2,
  scores: null,
  summary:
    "È un contratto di affitto per una casa a Milano. In generale è nella norma, ma ci sono 3 problemi importanti che dovresti risolvere prima di firmare. Il più grave è una penale esagerata se vuoi andartene prima della scadenza.",
  risks: [
    {
      severity: "alta",
      title: "Penale troppo alta se vai via prima",
      detail:
        "Se decidi di lasciare l'appartamento prima della scadenza, dovresti pagare 6 mesi di affitto come penale. È il doppio di quello che si vede normalmente (3 mesi). L'articolo 1384 del Codice Civile dice che se una penale è esagerata, il giudice può ridurla. La Cassazione nel 2023 ha confermato che 6 mesi sono troppi.",
      legalBasis: "Art. 1384 c.c.",
      courtCase: "Cass. Civ. n. 4258/2023",
    },
    {
      severity: "alta",
      title: "Ti fanno pagare le riparazioni del proprietario",
      detail:
        "L'art. 12 del contratto ti addossa le spese di manutenzione straordinaria (es. rifacimento tetto, impianti). Per legge queste spettano al proprietario (art. 1576 c.c.). Questa clausola è probabilmente nulla.",
      legalBasis: "Art. 1576 c.c.",
      courtCase: "",
    },
    {
      severity: "media",
      title: "Non si capisce come dare disdetta",
      detail:
        "Il contratto non specifica chiaramente i termini per la disdetta. La L. 431/1998 prevede un preavviso di 6 mesi con raccomandata A/R. Fatti inserire questa specifica per iscritto.",
      legalBasis: "L. 431/1998",
      courtCase: "",
    },
  ],
  deadlines: [
    { date: "15 Marzo 2026", action: "Termine per la firma del contratto" },
    { date: "1 Aprile 2026", action: "Inizio decorrenza locazione" },
    { date: "1 Ottobre 2030", action: "Prima possibilità di disdetta" },
  ],
  actions: [
    {
      priority: 1,
      action: "Chiedi la riduzione della penale di recesso da 6 a 3 mensilità",
      rationale: "La legge è dalla tua parte: la Cassazione ha già detto che 6 mesi sono troppi",
    },
    {
      priority: 2,
      action: "Fai eliminare l'art. 12 sulle spese straordinarie — è contra legem",
      rationale: "L'art. 1576 c.c. è chiaro: le spese straordinarie sono del proprietario",
    },
    {
      priority: 3,
      action: "Richiedi clausola esplicita sui termini di disdetta con raccomandata A/R",
      rationale: "Previene incomprensioni future",
    },
    {
      priority: 4,
      action: "Verifica che l'importo del deposito cauzionale non superi 3 mensilità",
      rationale: "È il limite legale secondo la L. 392/1978",
    },
  ],
  needsLawyer: true,
  lawyerSpecialization: "Diritto immobiliare / locazioni",
  lawyerReason:
    "Ci sono clausole potenzialmente nulle che un avvocato potrebbe far eliminare o modificare a tuo favore prima della firma",
};

export default function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="min-h-screen">
      <Navbar />

      <div className="max-w-[720px] mx-auto px-6 pt-24 pb-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-foreground-tertiary hover:text-foreground-secondary transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Torna alla dashboard
          </Link>
        </motion.div>
      </div>

      <ResultsView
        result={MOCK_RESULT}
        fileName={`Analisi #${id}`}
        analysisId={id}
        onReset={() => (window.location.href = "/")}
      />
    </div>
  );
}
