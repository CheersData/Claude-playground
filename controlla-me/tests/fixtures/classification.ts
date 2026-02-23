import type { ClassificationResult } from "@/lib/types";

export function makeClassification(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "contratto_locazione_abitativa",
    documentTypeLabel: "Contratto di Locazione ad Uso Abitativo",
    documentSubType: null,
    parties: [
      { role: "locatore", name: "Mario Rossi", type: "persona_fisica" },
      { role: "conduttore", name: "Luigi Bianchi", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto Civile",
    applicableLaws: [
      { reference: "L. 431/1998", name: "Disciplina locazioni abitative" },
      { reference: "Art. 1571-1614 c.c.", name: "Codice Civile - Locazione" },
    ],
    relevantInstitutes: ["locazione", "locazione_abitativa"],
    legalFocusAreas: ["diritto_civile", "locazione"],
    keyDates: [{ date: "2025-04-01", description: "Decorrenza contratto" }],
    summary: "Contratto di locazione abitativa 4+4 con canone EUR 800/mese.",
    confidence: 0.95,
    ...overrides,
  };
}
