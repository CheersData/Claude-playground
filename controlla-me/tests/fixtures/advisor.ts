import type { AdvisorResult } from "@/lib/types";

export function makeAdvisorResult(
  overrides?: Partial<AdvisorResult>
): AdvisorResult {
  return {
    fairnessScore: 6.2,
    summary:
      "Il contratto presenta una penale eccessiva per risoluzione anticipata. Per il resto, le condizioni sono nella norma.",
    risks: [
      {
        severity: "alta",
        title: "Penale eccessiva",
        detail:
          "Se devi andartene prima, ti chiedono 12 mesi di affitto come penale. È troppo.",
        legalBasis: "Art. 1384 c.c.",
        courtCase: "Cass. Civ. n. 4258/2023",
      },
    ],
    deadlines: [
      {
        date: "15 Marzo 2026",
        action: "Ultimo giorno per inviare disdetta con 6 mesi di preavviso",
      },
    ],
    actions: [
      {
        priority: 1,
        action: "Negozia la penale",
        rationale:
          "Chiedi di ridurla a 2-3 mensilità. È il tuo diritto e i giudici sono dalla tua parte.",
      },
    ],
    needsLawyer: true,
    lawyerSpecialization: "Diritto immobiliare / locazioni",
    lawyerReason:
      "La penale è potenzialmente nulla. Un avvocato può negoziare una riduzione o contestarla.",
    ...overrides,
  };
}
