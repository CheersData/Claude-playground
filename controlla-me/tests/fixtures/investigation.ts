import type { InvestigationResult, Finding } from "@/lib/types";

export function makeFinding(overrides?: Partial<Finding>): Finding {
  return {
    clauseId: "clause_1",
    laws: [
      {
        reference: "Art. 1384 c.c.",
        fullText:
          "La penale può essere diminuita equamente dal giudice se l'obbligazione principale è stata eseguita in parte.",
        sourceUrl: "https://www.brocardi.it/codice-civile/libro-quarto/titolo-i/capo-v/sezione-iii/art1384.html",
        isInForce: true,
        lastModified: null,
      },
    ],
    courtCases: [
      {
        reference: "Cass. Civ. Sez. III, n. 4258/2023",
        court: "Corte di Cassazione",
        date: "2023-02-13",
        summary:
          "La Cassazione ha ribadito che la penale manifestamente eccessiva può essere ridotta dal giudice.",
        relevance:
          "Conferma il principio di proporzionalità della penale contrattuale",
        sourceUrl: "https://www.italgiure.giustizia.it/",
      },
    ],
    legalOpinion:
      "Orientamento consolidato a favore della riduzione della penale eccessiva.",
    ...overrides,
  };
}

export function makeInvestigation(
  overrides?: Partial<InvestigationResult>
): InvestigationResult {
  return {
    findings: [makeFinding()],
    ...overrides,
  };
}
