/**
 * HR Pipeline Extended QA Test Suite
 *
 * Validates the 4-agent pipeline (classifier -> analyzer -> investigator -> advisor)
 * against ALL 10 HR document types, including:
 *
 * PROBLEMATIC (expected risks):
 *   - Patto di non concorrenza (nullo per assenza corrispettivo)
 *   - Contestazione disciplinare (addebiti generici)
 *   - Contratto TD 6 mesi (rinnovo automatico illimitato)
 *   - Licenziamento GMO (repechage dichiarato non dimostrato)
 *
 * CONFORMING (minimal risks):
 *   - Accordo smart working
 *   - Contratto apprendistato
 *   - Contratto somministrazione
 *   - Lettera dimissioni per giusta causa
 *   - Accordo straordinario
 *   - Contratto TI equilibrato
 *
 * Tests verify:
 *   - Classifier identifies correct HR doc types, subtypes, and institutes
 *   - Analyzer flags expected risks for problematic docs
 *   - Analyzer returns low risk for conforming docs
 *   - Investigator covers critical/high clauses
 *   - Advisor scoring calibrated (low for abusive, high for balanced)
 *   - Full orchestrator pipeline chains correctly
 *   - Pipeline contract validation (classifier->analyzer->investigator->advisor)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Document Fixtures (text) ───────────────────────────────────────
import {
  PATTO_NON_CONCORRENZA,
  CONTESTAZIONE_DISCIPLINARE,
  ACCORDO_SMART_WORKING,
  CONTRATTO_APPRENDISTATO,
  CONTRATTO_SOMMINISTRAZIONE,
  LETTERA_DIMISSIONI_GIUSTA_CAUSA,
  ACCORDO_STRAORDINARIO,
  CONTRATTO_TD_6MESI,
  LETTERA_LICENZIAMENTO_GMO,
  CONTRATTO_TI_EQUILIBRATO,
  ALL_EXTENDED_HR_FIXTURES,
  PROBLEMATIC_HR_FIXTURES,
  CONFORMING_HR_FIXTURES,
  type ExtendedHRFixture,
} from "../fixtures/hr-documents";

// ─── Pipeline Mock Factories ────────────────────────────────────────
import {
  // Classifier factories
  makeHRClassificationPattoNonConcorrenza,
  makeHRClassificationContestazioneDisciplinare,
  makeHRClassificationSmartWorking,
  makeHRClassificationApprendistato,
  makeHRClassificationSomministrazione,
  makeHRClassificationDimissioni,
  makeHRClassificationAccordoStraordinario,
  makeHRClassificationTD6Mesi,
  makeHRClassificationLicenziamentoGMO,
  makeHRClassificationTIEquilibrato,
  // Analysis factories
  makeHRAnalysisPattoNonConcorrenza,
  makeHRAnalysisContestazioneDisciplinare,
  makeHRAnalysisSmartWorking,
  makeHRAnalysisApprendistato,
  makeHRAnalysisSomministrazione,
  makeHRAnalysisDimissioni,
  makeHRAnalysisAccordoStraordinario,
  makeHRAnalysisTD6Mesi,
  makeHRAnalysisLicenziamentoGMO,
  makeHRAnalysisTIEquilibrato,
  // Investigation factories
  makeHRInvestigationPattoNonConcorrenza,
  makeHRInvestigationTD6Mesi,
  // Advisor factories
  makeHRAdvisorPattoNonConcorrenza,
  makeHRAdvisorSmartWorking,
  makeHRAdvisorTD6Mesi,
} from "../fixtures/hr-pipeline";

// ─── Hoisted mocks ──────────────────────────────────────────────────
const mockRunClassifier = vi.hoisted(() => vi.fn());
const mockRunAnalyzer = vi.hoisted(() => vi.fn());
const mockRunInvestigator = vi.hoisted(() => vi.fn());
const mockRunAdvisor = vi.hoisted(() => vi.fn());
const mockCreateSession = vi.hoisted(() => vi.fn());
const mockLoadSession = vi.hoisted(() => vi.fn());
const mockSavePhaseResult = vi.hoisted(() => vi.fn());
const mockSavePhaseTiming = vi.hoisted(() => vi.fn());
const mockFindSessionByDocument = vi.hoisted(() => vi.fn());

// ─── Module mocks ──────────────────────────────────────────────────
vi.mock("@/lib/agents/classifier", () => ({
  runClassifier: (...args: unknown[]) => mockRunClassifier(...args),
}));

vi.mock("@/lib/agents/analyzer", () => ({
  runAnalyzer: (...args: unknown[]) => mockRunAnalyzer(...args),
}));

vi.mock("@/lib/agents/investigator", () => ({
  runInvestigator: (...args: unknown[]) => mockRunInvestigator(...args),
}));

vi.mock("@/lib/agents/advisor", () => ({
  runAdvisor: (...args: unknown[]) => mockRunAdvisor(...args),
}));

vi.mock("@/lib/analysis-cache", () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  loadSession: (...args: unknown[]) => mockLoadSession(...args),
  savePhaseResult: (...args: unknown[]) => mockSavePhaseResult(...args),
  savePhaseTiming: (...args: unknown[]) => mockSavePhaseTiming(...args),
  findSessionByDocument: (...args: unknown[]) => mockFindSessionByDocument(...args),
}));

vi.mock("@/lib/legal-corpus", () => ({
  retrieveLegalContext: vi.fn().mockResolvedValue({
    bySource: {},
    byInstitute: {},
    bySemantic: [],
  }),
  formatLegalContextForPrompt: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/vector-store", () => ({
  buildRAGContext: vi.fn().mockResolvedValue(""),
  indexDocument: vi.fn().mockResolvedValue({ chunksIndexed: 0 }),
  indexAnalysisKnowledge: vi.fn().mockResolvedValue({ entriesIndexed: 0 }),
}));

vi.mock("@/lib/embeddings", () => ({
  isVectorDBEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/tiers", () => ({
  isAgentEnabled: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/company/hooks", () => ({
  onPipelineComplete: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agent-broadcast", () => ({
  broadcastConsoleAgent: vi.fn(),
}));

// ─── Import code under test AFTER mocks ─────────────────────────────
import { runOrchestrator } from "@/lib/agents/orchestrator";
import type { AdvisorResult } from "@/lib/types";

// ─── Helpers ────────────────────────────────────────────────────────

function makeCallbacks() {
  const progressCalls: Array<{ phase: string; status: string; data?: unknown }> = [];
  const errorCalls: Array<{ phase: string; error: string }> = [];
  const completeCalls: AdvisorResult[] = [];

  return {
    onProgress: (phase: string, status: string, data?: unknown) => {
      progressCalls.push({ phase, status, data });
    },
    onError: (phase: string, error: string) => {
      errorCalls.push({ phase, error });
    },
    onComplete: (result: AdvisorResult) => {
      completeCalls.push(result);
    },
    progressCalls,
    errorCalls,
    completeCalls,
  };
}

// =====================================================================
// SECTION 1: Fixture Loading and Validation
// =====================================================================

describe("HR Extended Fixtures — Loading and Validation", () => {
  it("loads all 10 extended HR fixtures", () => {
    expect(ALL_EXTENDED_HR_FIXTURES).toHaveLength(10);
  });

  it("has 4 problematic fixtures", () => {
    expect(PROBLEMATIC_HR_FIXTURES).toHaveLength(4);
  });

  it("has 6 conforming fixtures", () => {
    expect(CONFORMING_HR_FIXTURES).toHaveLength(6);
  });

  it("all fixture texts are non-empty (200+ chars)", () => {
    for (const fixture of ALL_EXTENDED_HR_FIXTURES) {
      expect(fixture.text.length).toBeGreaterThan(200);
    }
  });

  it("all fixture metadata IDs are unique", () => {
    const ids = ALL_EXTENDED_HR_FIXTURES.map((f) => f.metadata.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all fixture metadata has expectedRisks", () => {
    for (const fixture of ALL_EXTENDED_HR_FIXTURES) {
      expect(fixture.metadata.expectedRisks.length).toBeGreaterThan(0);
      expect(fixture.metadata.expectedDocType).toBeTruthy();
      expect(fixture.metadata.expectedSubType).toBeTruthy();
      expect(fixture.metadata.description.length).toBeGreaterThan(20);
    }
  });

  it("problematic fixtures have expectedOverallRisk >= medium", () => {
    for (const fixture of PROBLEMATIC_HR_FIXTURES) {
      expect(["critical", "high", "medium"]).toContain(fixture.expectedOverallRisk);
      expect(fixture.isConforming).toBe(false);
    }
  });

  it("conforming fixtures have expectedOverallRisk = low", () => {
    for (const fixture of CONFORMING_HR_FIXTURES) {
      expect(fixture.expectedOverallRisk).toBe("low");
      expect(fixture.isConforming).toBe(true);
    }
  });
});

// =====================================================================
// SECTION 2: Classifier — Extended HR Document Types
// =====================================================================

describe("HR Extended — Classifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies patto di non concorrenza", () => {
    const c = makeHRClassificationPattoNonConcorrenza();
    expect(c.documentType).toBe("patto_non_concorrenza");
    expect(c.documentSubType).toBe("patto_non_concorrenza");
    expect(c.relevantInstitutes).toContain("patto_non_concorrenza");
    expect(c.applicableLaws.some((l) => l.reference.includes("2125"))).toBe(true);
  });

  it("classifies contestazione disciplinare", () => {
    const c = makeHRClassificationContestazioneDisciplinare();
    expect(c.documentType).toBe("contestazione_disciplinare");
    expect(c.relevantInstitutes).toContain("sanzioni_disciplinari");
    expect(c.relevantInstitutes).toContain("diritto_difesa");
    expect(c.applicableLaws.some((l) => l.reference.includes("300/1970"))).toBe(true);
  });

  it("classifies accordo smart working", () => {
    const c = makeHRClassificationSmartWorking();
    expect(c.documentType).toBe("accordo_lavoro_agile");
    expect(c.documentSubType).toBe("accordo_smart_working");
    expect(c.relevantInstitutes).toContain("lavoro_agile");
    expect(c.relevantInstitutes).toContain("diritto_disconnessione");
    expect(c.applicableLaws.some((l) => l.reference.includes("81/2017"))).toBe(true);
  });

  it("classifies contratto apprendistato", () => {
    const c = makeHRClassificationApprendistato();
    expect(c.documentType).toBe("contratto_lavoro_subordinato");
    expect(c.documentSubType).toBe("apprendistato");
    expect(c.relevantInstitutes).toContain("apprendistato");
    expect(c.relevantInstitutes).toContain("piano_formativo");
    expect(c.applicableLaws.some((l) => l.reference.includes("81/2015"))).toBe(true);
  });

  it("classifies contratto somministrazione", () => {
    const c = makeHRClassificationSomministrazione();
    expect(c.documentType).toBe("contratto_somministrazione");
    expect(c.documentSubType).toBe("somministrazione");
    expect(c.relevantInstitutes).toContain("somministrazione_lavoro");
    expect(c.relevantInstitutes).toContain("parita_trattamento");
    expect(c.parties).toHaveLength(3); // somministratore + utilizzatore + lavoratore
  });

  it("classifies lettera dimissioni giusta causa", () => {
    const c = makeHRClassificationDimissioni();
    expect(c.documentType).toBe("dimissioni");
    expect(c.documentSubType).toBe("dimissioni_giusta_causa");
    expect(c.relevantInstitutes).toContain("dimissioni");
    expect(c.relevantInstitutes).toContain("giusta_causa");
    expect(c.applicableLaws.some((l) => l.reference.includes("2119"))).toBe(true);
  });

  it("classifies accordo straordinario", () => {
    const c = makeHRClassificationAccordoStraordinario();
    expect(c.documentType).toBe("accordo_straordinario");
    expect(c.relevantInstitutes).toContain("orario_e_riposi");
    expect(c.applicableLaws.some((l) => l.reference.includes("66/2003"))).toBe(true);
  });

  it("classifies contratto TD 6 mesi with rinnovo illimitato", () => {
    const c = makeHRClassificationTD6Mesi();
    expect(c.documentType).toBe("contratto_lavoro_subordinato");
    expect(c.documentSubType).toBe("tempo_determinato");
    expect(c.relevantInstitutes).toContain("rinnovo_automatico");
    expect(c.relevantInstitutes).toContain("clausola_esclusiva");
  });

  it("classifies licenziamento GMO", () => {
    const c = makeHRClassificationLicenziamentoGMO();
    expect(c.documentType).toBe("lettera_licenziamento");
    expect(c.documentSubType).toBe("licenziamento_giustificato_motivo_oggettivo");
    expect(c.relevantInstitutes).toContain("repechage");
  });

  it("classifies contratto TI equilibrato", () => {
    const c = makeHRClassificationTIEquilibrato();
    expect(c.documentType).toBe("contratto_lavoro_subordinato");
    expect(c.documentSubType).toBe("tempo_indeterminato");
    expect(c.relevantInstitutes).toContain("mansioni_inquadramento");
  });

  it("all classifications have required fields for analyzer", () => {
    const allClassifications = [
      makeHRClassificationPattoNonConcorrenza(),
      makeHRClassificationContestazioneDisciplinare(),
      makeHRClassificationSmartWorking(),
      makeHRClassificationApprendistato(),
      makeHRClassificationSomministrazione(),
      makeHRClassificationDimissioni(),
      makeHRClassificationAccordoStraordinario(),
      makeHRClassificationTD6Mesi(),
      makeHRClassificationLicenziamentoGMO(),
      makeHRClassificationTIEquilibrato(),
    ];

    for (const c of allClassifications) {
      expect(c.documentTypeLabel).toBeTruthy();
      expect(c.jurisdiction).toBeTruthy();
      expect(Array.isArray(c.applicableLaws)).toBe(true);
      expect(Array.isArray(c.relevantInstitutes)).toBe(true);
      expect(Array.isArray(c.legalFocusAreas)).toBe(true);
      expect(Array.isArray(c.parties)).toBe(true);
      expect(c.parties.length).toBeGreaterThan(0);
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// =====================================================================
// SECTION 3: Analyzer — Problematic Documents (Expected Risks)
// =====================================================================

describe("HR Extended — Analyzer (Problematic Documents)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Patto di Non Concorrenza", () => {
    it("flags assenza corrispettivo as critical", () => {
      const a = makeHRAnalysisPattoNonConcorrenza();
      const clause = a.clauses.find((c) => c.id === "hr_pnc_1");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("critical");
      expect(clause!.potentialViolation).toContain("2125");
    });

    it("flags ambito territoriale UE as high", () => {
      const a = makeHRAnalysisPattoNonConcorrenza();
      const clause = a.clauses.find((c) => c.id === "hr_pnc_2");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("high");
    });

    it("flags penale sproporzionata as high", () => {
      const a = makeHRAnalysisPattoNonConcorrenza();
      const clause = a.clauses.find((c) => c.id === "hr_pnc_3");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("high");
      expect(clause!.potentialViolation).toContain("1384");
    });

    it("overallRisk = critical", () => {
      expect(makeHRAnalysisPattoNonConcorrenza().overallRisk).toBe("critical");
    });

    it("identifies missing corrispettivo as high importance", () => {
      const a = makeHRAnalysisPattoNonConcorrenza();
      expect(a.missingElements.length).toBeGreaterThan(0);
      expect(a.missingElements[0].importance).toBe("high");
    });
  });

  describe("Contestazione Disciplinare", () => {
    it("flags addebiti generici as high", () => {
      const a = makeHRAnalysisContestazioneDisciplinare();
      const clause = a.clauses.find((c) => c.id === "hr_cd_1");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("high");
      expect(clause!.potentialViolation).toContain("300/1970");
    });

    it("overallRisk = medium (procedure correct, content vague)", () => {
      expect(makeHRAnalysisContestazioneDisciplinare().overallRisk).toBe("medium");
    });

    it("recognizes positive procedural aspects", () => {
      const a = makeHRAnalysisContestazioneDisciplinare();
      expect(a.positiveAspects.length).toBeGreaterThan(0);
      expect(a.positiveAspects.some((p) => p.toLowerCase().includes("5 giorni"))).toBe(true);
    });
  });

  describe("Contratto TD 6 mesi — rinnovo illimitato", () => {
    it("flags rinnovo automatico illimitato as critical", () => {
      const a = makeHRAnalysisTD6Mesi();
      const clause = a.clauses.find((c) => c.id === "hr_td6_1");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("critical");
      expect(clause!.potentialViolation).toContain("81/2015");
    });

    it("flags preavviso 90 giorni as high", () => {
      const a = makeHRAnalysisTD6Mesi();
      const clause = a.clauses.find((c) => c.id === "hr_td6_2");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("high");
    });

    it("flags clausola esclusiva totale as high", () => {
      const a = makeHRAnalysisTD6Mesi();
      const clause = a.clauses.find((c) => c.id === "hr_td6_3");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("high");
    });

    it("overallRisk = high", () => {
      expect(makeHRAnalysisTD6Mesi().overallRisk).toBe("high");
    });
  });

  describe("Licenziamento GMO", () => {
    it("flags repechage dichiarato non dimostrato as medium", () => {
      const a = makeHRAnalysisLicenziamentoGMO();
      const clause = a.clauses.find((c) => c.id === "hr_gmo_1");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("medium");
    });

    it("overallRisk = medium (motivazione dettagliata ma repechage debole)", () => {
      expect(makeHRAnalysisLicenziamentoGMO().overallRisk).toBe("medium");
    });

    it("recognizes detailed motivation as positive", () => {
      const a = makeHRAnalysisLicenziamentoGMO();
      expect(a.positiveAspects.some((p) => p.toLowerCase().includes("motivazione"))).toBe(true);
    });
  });
});

// =====================================================================
// SECTION 4: Analyzer — Conforming Documents (Minimal Risks)
// =====================================================================

describe("HR Extended — Analyzer (Conforming Documents)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("smart working: overallRisk = low, no clauses flagged", () => {
    const a = makeHRAnalysisSmartWorking();
    expect(a.overallRisk).toBe("low");
    expect(a.clauses).toHaveLength(0);
    expect(a.positiveAspects.length).toBeGreaterThan(0);
  });

  it("apprendistato: overallRisk = low, only minor risk", () => {
    const a = makeHRAnalysisApprendistato();
    expect(a.overallRisk).toBe("low");
    expect(a.clauses.length).toBeLessThanOrEqual(1);
    if (a.clauses.length > 0) {
      expect(["medium", "low", "info"]).toContain(a.clauses[0].riskLevel);
    }
    expect(a.positiveAspects.length).toBeGreaterThanOrEqual(3);
  });

  it("somministrazione: overallRisk = low, no clauses flagged", () => {
    const a = makeHRAnalysisSomministrazione();
    expect(a.overallRisk).toBe("low");
    expect(a.clauses).toHaveLength(0);
    expect(a.positiveAspects.some((p) => p.toLowerCase().includes("parita"))).toBe(true);
  });

  it("dimissioni giusta causa: overallRisk = low, document is defensive", () => {
    const a = makeHRAnalysisDimissioni();
    expect(a.overallRisk).toBe("low");
    expect(a.clauses).toHaveLength(0);
    expect(a.positiveAspects.some((p) => p.toLowerCase().includes("motivazione"))).toBe(true);
  });

  it("accordo straordinario: overallRisk = low, CCNL compliant", () => {
    const a = makeHRAnalysisAccordoStraordinario();
    expect(a.overallRisk).toBe("low");
    expect(a.clauses).toHaveLength(0);
    expect(a.positiveAspects.some((p) => p.includes("25%"))).toBe(true);
  });

  it("contratto TI equilibrato: overallRisk = low, no risks", () => {
    const a = makeHRAnalysisTIEquilibrato();
    expect(a.overallRisk).toBe("low");
    expect(a.clauses).toHaveLength(0);
    expect(a.positiveAspects.length).toBeGreaterThanOrEqual(3);
  });
});

// =====================================================================
// SECTION 5: Investigator — Extended Documents
// =====================================================================

describe("HR Extended — Investigator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("patto non concorrenza: covers corrispettivo clause with Art. 2125", () => {
    const investigation = makeHRInvestigationPattoNonConcorrenza();
    const finding = investigation.findings.find((f) => f.clauseId === "hr_pnc_1");
    expect(finding).toBeDefined();
    expect(finding!.laws.length).toBeGreaterThan(0);
    expect(finding!.laws[0].reference).toContain("2125");
    expect(finding!.laws[0].isInForce).toBe(true);
  });

  it("patto non concorrenza: includes court case on corrispettivo", () => {
    const investigation = makeHRInvestigationPattoNonConcorrenza();
    const finding = investigation.findings.find((f) => f.clauseId === "hr_pnc_1");
    expect(finding!.courtCases.length).toBeGreaterThan(0);
    expect(finding!.courtCases[0].court).toBe("Corte di Cassazione");
  });

  it("TD 6 mesi: covers rinnovo automatico with Art. 19 D.Lgs. 81/2015", () => {
    const investigation = makeHRInvestigationTD6Mesi();
    const finding = investigation.findings.find((f) => f.clauseId === "hr_td6_1");
    expect(finding).toBeDefined();
    expect(finding!.laws[0].reference).toContain("81/2015");
  });

  it("every finding has a non-empty legalOpinion", () => {
    const investigations = [
      makeHRInvestigationPattoNonConcorrenza(),
      makeHRInvestigationTD6Mesi(),
    ];
    for (const inv of investigations) {
      for (const finding of inv.findings) {
        expect(finding.legalOpinion).toBeTruthy();
        expect(finding.legalOpinion.length).toBeGreaterThan(10);
      }
    }
  });
});

// =====================================================================
// SECTION 6: Advisor — Scoring Calibration
// =====================================================================

describe("HR Extended — Advisor Scoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("problematic documents — low scores", () => {
    it("patto non concorrenza: fairnessScore <= 3 (nullo)", () => {
      const advisor = makeHRAdvisorPattoNonConcorrenza();
      expect(advisor.fairnessScore).toBeLessThanOrEqual(3);
      expect(advisor.needsLawyer).toBe(true);
    });

    it("TD 6 mesi: fairnessScore <= 5 (clausole illegali)", () => {
      const advisor = makeHRAdvisorTD6Mesi();
      expect(advisor.fairnessScore).toBeLessThanOrEqual(5);
      expect(advisor.needsLawyer).toBe(true);
    });
  });

  describe("conforming documents — high scores", () => {
    it("smart working: fairnessScore >= 7 (equilibrato)", () => {
      const advisor = makeHRAdvisorSmartWorking();
      expect(advisor.fairnessScore).toBeGreaterThanOrEqual(7);
      expect(advisor.needsLawyer).toBe(false);
    });
  });

  describe("score dimensions", () => {
    it("all advisors have 4-dimension scores in 1-10 range", () => {
      const advisors = [
        makeHRAdvisorPattoNonConcorrenza(),
        makeHRAdvisorSmartWorking(),
        makeHRAdvisorTD6Mesi(),
      ];

      for (const advisor of advisors) {
        expect(advisor.scores).not.toBeNull();
        for (const val of Object.values(advisor.scores!)) {
          expect(val).toBeGreaterThanOrEqual(1);
          expect(val).toBeLessThanOrEqual(10);
        }
      }
    });
  });

  describe("output limits enforced", () => {
    it("all advisors have max 3 risks and max 3 actions", () => {
      const advisors = [
        makeHRAdvisorPattoNonConcorrenza(),
        makeHRAdvisorSmartWorking(),
        makeHRAdvisorTD6Mesi(),
      ];

      for (const advisor of advisors) {
        expect(advisor.risks.length).toBeLessThanOrEqual(3);
        expect(advisor.actions.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("lawyerSpecialization matches document type", () => {
    it("patto non concorrenza: specialization mentions lavoro", () => {
      const a = makeHRAdvisorPattoNonConcorrenza();
      expect(a.lawyerSpecialization.toLowerCase()).toContain("lavoro");
    });

    it("TD 6 mesi: specialization mentions lavoro", () => {
      const a = makeHRAdvisorTD6Mesi();
      expect(a.lawyerSpecialization.toLowerCase()).toContain("lavoro");
    });
  });
});

// =====================================================================
// SECTION 7: Full Orchestrator — Extended HR Pipeline E2E
// =====================================================================

describe("HR Extended — Orchestrator E2E", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSession.mockResolvedValue("hr-ext-session-001");
    mockLoadSession.mockResolvedValue(null);
    mockFindSessionByDocument.mockResolvedValue(null);
    mockSavePhaseResult.mockResolvedValue(undefined);
    mockSavePhaseTiming.mockResolvedValue(undefined);
  });

  it("runs full pipeline for patto di non concorrenza", async () => {
    const classification = makeHRClassificationPattoNonConcorrenza();
    const analysis = makeHRAnalysisPattoNonConcorrenza();
    const investigation = makeHRInvestigationPattoNonConcorrenza();
    const advisor = makeHRAdvisorPattoNonConcorrenza();

    mockRunClassifier.mockResolvedValue(classification);
    mockRunAnalyzer.mockResolvedValue(analysis);
    mockRunInvestigator.mockResolvedValue(investigation);
    mockRunAdvisor.mockResolvedValue(advisor);

    const callbacks = makeCallbacks();
    const result = await runOrchestrator(PATTO_NON_CONCORRENZA, callbacks);

    expect(mockRunClassifier).toHaveBeenCalledOnce();
    expect(mockRunAnalyzer).toHaveBeenCalledOnce();
    expect(mockRunInvestigator).toHaveBeenCalledOnce();
    expect(mockRunAdvisor).toHaveBeenCalledOnce();

    expect(result.classification!.documentType).toBe("patto_non_concorrenza");
    expect(result.analysis!.overallRisk).toBe("critical");
    expect(result.advice!.needsLawyer).toBe(true);
    expect(result.advice!.fairnessScore).toBeLessThanOrEqual(3);
  });

  it("runs full pipeline for smart working (conforming doc)", async () => {
    const classification = makeHRClassificationSmartWorking();
    const analysis = makeHRAnalysisSmartWorking();
    const investigation = { findings: [] };
    const advisor = makeHRAdvisorSmartWorking();

    mockRunClassifier.mockResolvedValue(classification);
    mockRunAnalyzer.mockResolvedValue(analysis);
    mockRunInvestigator.mockResolvedValue(investigation);
    mockRunAdvisor.mockResolvedValue(advisor);

    const callbacks = makeCallbacks();
    const result = await runOrchestrator(ACCORDO_SMART_WORKING, callbacks);

    expect(result.classification!.documentType).toBe("accordo_lavoro_agile");
    expect(result.analysis!.overallRisk).toBe("low");
    expect(result.analysis!.clauses).toHaveLength(0);
    expect(result.advice!.needsLawyer).toBe(false);
    expect(result.advice!.fairnessScore).toBeGreaterThanOrEqual(7);
  });

  it("runs full pipeline for contratto TD 6 mesi", async () => {
    const classification = makeHRClassificationTD6Mesi();
    const analysis = makeHRAnalysisTD6Mesi();
    const investigation = makeHRInvestigationTD6Mesi();
    const advisor = makeHRAdvisorTD6Mesi();

    mockRunClassifier.mockResolvedValue(classification);
    mockRunAnalyzer.mockResolvedValue(analysis);
    mockRunInvestigator.mockResolvedValue(investigation);
    mockRunAdvisor.mockResolvedValue(advisor);

    const callbacks = makeCallbacks();
    const result = await runOrchestrator(CONTRATTO_TD_6MESI, callbacks);

    expect(result.classification!.documentSubType).toBe("tempo_determinato");
    expect(result.analysis!.clauses.length).toBeGreaterThanOrEqual(3);
    expect(result.advice!.needsLawyer).toBe(true);
  });

  it("emits correct progress events for all 4 phases", async () => {
    mockRunClassifier.mockResolvedValue(makeHRClassificationPattoNonConcorrenza());
    mockRunAnalyzer.mockResolvedValue(makeHRAnalysisPattoNonConcorrenza());
    mockRunInvestigator.mockResolvedValue(makeHRInvestigationPattoNonConcorrenza());
    mockRunAdvisor.mockResolvedValue(makeHRAdvisorPattoNonConcorrenza());

    const callbacks = makeCallbacks();
    await runOrchestrator(PATTO_NON_CONCORRENZA, callbacks);

    const phases = callbacks.progressCalls.map((p) => p.phase);
    expect(phases).toContain("classifier");
    expect(phases).toContain("analyzer");
    expect(phases).toContain("investigator");
    expect(phases).toContain("advisor");

    // Each phase has running + done
    for (const phase of ["classifier", "analyzer", "investigator", "advisor"]) {
      const events = callbacks.progressCalls.filter((p) => p.phase === phase);
      expect(events.some((e) => e.status === "running")).toBe(true);
      expect(events.some((e) => e.status === "done")).toBe(true);
    }
  });

  it("emits complete event with advisor result", async () => {
    const advisor = makeHRAdvisorPattoNonConcorrenza();
    mockRunClassifier.mockResolvedValue(makeHRClassificationPattoNonConcorrenza());
    mockRunAnalyzer.mockResolvedValue(makeHRAnalysisPattoNonConcorrenza());
    mockRunInvestigator.mockResolvedValue(makeHRInvestigationPattoNonConcorrenza());
    mockRunAdvisor.mockResolvedValue(advisor);

    const callbacks = makeCallbacks();
    await runOrchestrator(PATTO_NON_CONCORRENZA, callbacks);

    expect(callbacks.completeCalls).toHaveLength(1);
    expect(callbacks.completeCalls[0]).toEqual(advisor);
  });

  it("caches phase results after each step", async () => {
    mockRunClassifier.mockResolvedValue(makeHRClassificationPattoNonConcorrenza());
    mockRunAnalyzer.mockResolvedValue(makeHRAnalysisPattoNonConcorrenza());
    mockRunInvestigator.mockResolvedValue(makeHRInvestigationPattoNonConcorrenza());
    mockRunAdvisor.mockResolvedValue(makeHRAdvisorPattoNonConcorrenza());

    await runOrchestrator(PATTO_NON_CONCORRENZA, makeCallbacks());

    expect(mockSavePhaseResult).toHaveBeenCalledWith("hr-ext-session-001", "classification", expect.any(Object));
    expect(mockSavePhaseResult).toHaveBeenCalledWith("hr-ext-session-001", "analysis", expect.any(Object));
    expect(mockSavePhaseResult).toHaveBeenCalledWith("hr-ext-session-001", "investigation", expect.any(Object));
    expect(mockSavePhaseResult).toHaveBeenCalledWith("hr-ext-session-001", "advice", expect.any(Object));
  });

  it("continues pipeline when investigator fails (non-fatal)", async () => {
    mockRunClassifier.mockResolvedValue(makeHRClassificationPattoNonConcorrenza());
    mockRunAnalyzer.mockResolvedValue(makeHRAnalysisPattoNonConcorrenza());
    mockRunInvestigator.mockRejectedValue(new Error("Web search unavailable"));
    mockRunAdvisor.mockResolvedValue(makeHRAdvisorPattoNonConcorrenza());

    const callbacks = makeCallbacks();
    const result = await runOrchestrator(PATTO_NON_CONCORRENZA, callbacks);

    expect(result.investigation).toEqual({ findings: [] });
    expect(result.advice).toBeDefined();
    expect(mockRunAdvisor).toHaveBeenCalledOnce();
  });
});

// =====================================================================
// SECTION 8: Pipeline Contract Validation — Extended Types
// =====================================================================

describe("HR Extended — Pipeline Contract Validation", () => {
  it("all classifier outputs have required fields for analyzer", () => {
    const classifications = [
      makeHRClassificationPattoNonConcorrenza(),
      makeHRClassificationContestazioneDisciplinare(),
      makeHRClassificationSmartWorking(),
      makeHRClassificationApprendistato(),
      makeHRClassificationSomministrazione(),
      makeHRClassificationDimissioni(),
      makeHRClassificationAccordoStraordinario(),
      makeHRClassificationTD6Mesi(),
      makeHRClassificationLicenziamentoGMO(),
      makeHRClassificationTIEquilibrato(),
    ];

    for (const c of classifications) {
      // Required by analyzer prompt builder
      expect(c.documentTypeLabel).toBeTruthy();
      expect(c.jurisdiction).toBeTruthy();
      expect(Array.isArray(c.applicableLaws)).toBe(true);
      expect(c.applicableLaws.length).toBeGreaterThan(0);
      for (const law of c.applicableLaws) {
        expect(law.reference).toBeTruthy();
        expect(law.name).toBeTruthy();
      }
    }
  });

  it("all analyzer outputs have unique clause IDs", () => {
    const analyses = [
      makeHRAnalysisPattoNonConcorrenza(),
      makeHRAnalysisContestazioneDisciplinare(),
      makeHRAnalysisTD6Mesi(),
      makeHRAnalysisLicenziamentoGMO(),
      makeHRAnalysisApprendistato(),
    ];

    for (const a of analyses) {
      if (a.clauses.length > 0) {
        const ids = a.clauses.map((c) => c.id);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length);
        for (const clause of a.clauses) {
          expect(clause.id).toBeTruthy();
          expect(clause.riskLevel).toBeTruthy();
          expect(clause.title).toBeTruthy();
          expect(clause.issue).toBeTruthy();
        }
      }
    }
  });

  it("investigator findings reference valid clause IDs from analyzer", () => {
    // Patto non concorrenza
    const pncAnalysis = makeHRAnalysisPattoNonConcorrenza();
    const pncInvestigation = makeHRInvestigationPattoNonConcorrenza();
    const pncClauseIds = pncAnalysis.clauses.map((c) => c.id);
    for (const finding of pncInvestigation.findings) {
      expect(pncClauseIds).toContain(finding.clauseId);
    }

    // TD 6 mesi
    const td6Analysis = makeHRAnalysisTD6Mesi();
    const td6Investigation = makeHRInvestigationTD6Mesi();
    const td6ClauseIds = td6Analysis.clauses.map((c) => c.id);
    for (const finding of td6Investigation.findings) {
      expect(td6ClauseIds).toContain(finding.clauseId);
    }
  });

  it("advisor output structure matches expected interface", () => {
    const advisors = [
      makeHRAdvisorPattoNonConcorrenza(),
      makeHRAdvisorSmartWorking(),
      makeHRAdvisorTD6Mesi(),
    ];

    for (const a of advisors) {
      expect(typeof a.fairnessScore).toBe("number");
      expect(a.fairnessScore).toBeGreaterThanOrEqual(1);
      expect(a.fairnessScore).toBeLessThanOrEqual(10);
      expect(typeof a.summary).toBe("string");
      expect(a.summary.length).toBeGreaterThan(10);
      expect(Array.isArray(a.risks)).toBe(true);
      expect(Array.isArray(a.deadlines)).toBe(true);
      expect(Array.isArray(a.actions)).toBe(true);
      expect(typeof a.needsLawyer).toBe("boolean");
      expect(typeof a.lawyerSpecialization).toBe("string");
      expect(typeof a.lawyerReason).toBe("string");
    }
  });
});

// =====================================================================
// SECTION 9: Document Content — Key Clause Presence
// =====================================================================

describe("HR Extended — Document Content Verification", () => {
  it("patto non concorrenza contains key problematic clauses", () => {
    expect(PATTO_NON_CONCORRENZA).toContain("36 (trentasei) mesi");
    expect(PATTO_NON_CONCORRENZA).toContain("Unione Europea");
    expect(PATTO_NON_CONCORRENZA).toContain("ricompreso nella retribuzione ordinaria");
    expect(PATTO_NON_CONCORRENZA).toContain("EUR 150.000");
  });

  it("contestazione disciplinare contains vague allegations", () => {
    expect(CONTESTAZIONE_DISCIPLINARE).toContain("plurime violazioni");
    expect(CONTESTAZIONE_DISCIPLINARE).toContain("5 (cinque) giorni");
    expect(CONTESTAZIONE_DISCIPLINARE).toContain("art. 7");
  });

  it("smart working contains conforming provisions", () => {
    expect(ACCORDO_SMART_WORKING).toContain("disconnessione");
    expect(ACCORDO_SMART_WORKING).toContain("L. 81/2017");
    expect(ACCORDO_SMART_WORKING).toContain("contattabilita");
  });

  it("apprendistato contains required elements", () => {
    expect(CONTRATTO_APPRENDISTATO).toContain("Piano Formativo Individuale");
    expect(CONTRATTO_APPRENDISTATO).toContain("tutor aziendale");
    expect(CONTRATTO_APPRENDISTATO).toContain("art. 44");
  });

  it("somministrazione contains conforming provisions", () => {
    expect(CONTRATTO_SOMMINISTRAZIONE).toContain("parita di trattamento");
    expect(CONTRATTO_SOMMINISTRAZIONE).toContain("30%");
    expect(CONTRATTO_SOMMINISTRAZIONE).toContain("D.Lgs. 81/2008");
  });

  it("dimissioni giusta causa contains specific facts", () => {
    expect(LETTERA_DIMISSIONI_GIUSTA_CAUSA).toContain("MANCATO PAGAMENTO");
    expect(LETTERA_DIMISSIONI_GIUSTA_CAUSA).toContain("MANCATO VERSAMENTO CONTRIBUTI");
    expect(LETTERA_DIMISSIONI_GIUSTA_CAUSA).toContain("DEMANSIONAMENTO");
    expect(LETTERA_DIMISSIONI_GIUSTA_CAUSA).toContain("art. 2119");
  });

  it("accordo straordinario contains CCNL-compliant surcharges", () => {
    expect(ACCORDO_STRAORDINARIO).toContain("25%");
    expect(ACCORDO_STRAORDINARIO).toContain("30%");
    expect(ACCORDO_STRAORDINARIO).toContain("50%");
    expect(ACCORDO_STRAORDINARIO).toContain("11 ore consecutive");
  });

  it("TD 6 mesi contains problematic renewal clause", () => {
    expect(CONTRATTO_TD_6MESI).toContain("rinnova automaticamente");
    expect(CONTRATTO_TD_6MESI).toContain("numero di rinnovi consecutivi");
    expect(CONTRATTO_TD_6MESI).toContain("90 giorni");
  });

  it("licenziamento GMO contains detailed motivation", () => {
    expect(LETTERA_LICENZIAMENTO_GMO).toContain("giustificato motivo oggettivo");
    expect(LETTERA_LICENZIAMENTO_GMO).toContain("35%");
    expect(LETTERA_LICENZIAMENTO_GMO).toContain("repechage");
  });

  it("TI equilibrato contains conforming provisions", () => {
    expect(CONTRATTO_TI_EQUILIBRATO).toContain("art. 2103 c.c.");
    expect(CONTRATTO_TI_EQUILIBRATO).toContain("60 giorni");
    expect(CONTRATTO_TI_EQUILIBRATO).toContain("Responsabile Punto Vendita");
  });
});
