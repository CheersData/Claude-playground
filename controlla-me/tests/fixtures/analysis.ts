import type { AnalysisResult, Clause, MissingElement } from "@/lib/types";

export function makeClause(overrides?: Partial<Clause>): Clause {
  return {
    id: "clause_1",
    title: "Penale eccessiva per risoluzione anticipata",
    originalText:
      "In caso di risoluzione anticipata da parte del Conduttore, questi dovrà corrispondere una penale pari a 12 mensilità.",
    riskLevel: "high",
    issue: "Penale sproporzionata rispetto al danno effettivo",
    potentialViolation: "Art. 1384 c.c. - Riduzione della penale",
    marketStandard: "Penale proporzionata (2-3 mensilità)",
    recommendation: "Negoziare riduzione a 2-3 mensilità",
    ...overrides,
  };
}

export function makeMissingElement(
  overrides?: Partial<MissingElement>
): MissingElement {
  return {
    element: "Clausola di recesso per giusta causa",
    importance: "high",
    explanation:
      "Il contratto non prevede la possibilità di recesso per giusta causa.",
    ...overrides,
  };
}

export function makeAnalysis(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [makeClause()],
    missingElements: [],
    overallRisk: "medium",
    positiveAspects: ["Durata conforme alla L. 431/1998", "Canone nella media"],
    ...overrides,
  };
}
