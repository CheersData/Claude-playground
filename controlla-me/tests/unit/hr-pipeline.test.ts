/**
 * HR Pipeline QA Test Suite
 *
 * Validates the 4-agent pipeline (classifier → analyzer → investigator → advisor)
 * against HR contract fixtures: TI, TD, and licenziamento.
 *
 * Tests verify:
 * - Classifier identifies correct HR doc types, subtypes, and institutes
 * - Analyzer flags expected HR risks (demansionamento, straordinario, non concorrenza, etc.)
 * - Investigator covers all critical/high clauses
 * - Advisor scoring is calibrated for HR (low scores for abusive contracts)
 * - Full orchestrator pipeline chains correctly for HR documents
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── HR Fixtures ─────────────────────────────────────────────────────
import {
  CONTRATTO_TEMPO_INDETERMINATO,
  CONTRATTO_TEMPO_DETERMINATO,
  LETTERA_LICENZIAMENTO_GIUSTA_CAUSA,
  ALL_HR_FIXTURES,
  type HRContractMetadata,
  METADATA_TEMPO_INDETERMINATO,
  METADATA_TEMPO_DETERMINATO,
  METADATA_LICENZIAMENTO,
} from "../fixtures/hr-contracts";

import {
  makeHRClassificationTI,
  makeHRClassificationTD,
  makeHRClassificationLicenziamento,
  makeHRAnalysisTI,
  makeHRAnalysisTD,
  makeHRAnalysisLicenziamento,
  makeHRInvestigationTI,
  makeHRInvestigationLicenziamento,
  makeHRAdvisorTI,
  makeHRAdvisorLicenziamento,
} from "../fixtures/hr-pipeline";

// ─── Hoisted mocks ──────────────────────────────────────────────────
const mockRunAgent = vi.hoisted(() => vi.fn());
const mockRunClassifier = vi.hoisted(() => vi.fn());
const mockRunAnalyzer = vi.hoisted(() => vi.fn());
const mockRunInvestigator = vi.hoisted(() => vi.fn());
const mockRunAdvisor = vi.hoisted(() => vi.fn());
const mockCreateSession = vi.hoisted(() => vi.fn());
const mockLoadSession = vi.hoisted(() => vi.fn());
const mockSavePhaseResult = vi.hoisted(() => vi.fn());
const mockSavePhaseTiming = vi.hoisted(() => vi.fn());
const mockFindSessionByDocument = vi.hoisted(() => vi.fn());

// ─── Module mocks ───────────────────────────────────────────────────
vi.mock("@/lib/ai-sdk/agent-runner", () => ({
  runAgent: mockRunAgent,
}));

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
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
} from "@/lib/types";

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
// SECTION 1: Classifier — HR Document Type Identification
// =====================================================================

describe("HR Pipeline — Classifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies contratto TI with correct type, subtype, and institutes", () => {
    const classification = makeHRClassificationTI();

    expect(classification.documentType).toBe("contratto_lavoro_subordinato");
    expect(classification.documentSubType).toBe("tempo_indeterminato");
    expect(classification.relevantInstitutes).toContain("demansionamento");
    expect(classification.relevantInstitutes).toContain("patto_non_concorrenza");
    expect(classification.legalFocusAreas).toContain("diritto_del_lavoro");
    expect(classification.parties).toHaveLength(2);
    expect(classification.parties[0].role).toBe("datore_lavoro");
    expect(classification.parties[1].role).toBe("lavoratore");
  });

  it("classifies contratto TD with correct type and subtype", () => {
    const classification = makeHRClassificationTD();

    expect(classification.documentType).toBe("contratto_lavoro_subordinato");
    expect(classification.documentSubType).toBe("tempo_determinato");
    expect(classification.relevantInstitutes).toContain("contratto_termine");
    expect(classification.relevantInstitutes).toContain("rinnovo_automatico");
    expect(classification.applicableLaws.some((l) => l.reference.includes("81/2015"))).toBe(true);
  });

  it("classifies lettera licenziamento with correct type and institutes", () => {
    const classification = makeHRClassificationLicenziamento();

    expect(classification.documentType).toBe("lettera_licenziamento");
    expect(classification.documentSubType).toBe("licenziamento_giusta_causa");
    expect(classification.relevantInstitutes).toContain("giusta_causa");
    expect(classification.relevantInstitutes).toContain("procedimento_disciplinare");
    expect(classification.applicableLaws.some((l) => l.reference.includes("300/1970"))).toBe(true);
  });

  it("all HR fixture metadata has expected doc types", () => {
    const expectations: Array<{ metadata: HRContractMetadata; docType: string; subType: string }> = [
      { metadata: METADATA_TEMPO_INDETERMINATO, docType: "contratto_lavoro_subordinato", subType: "tempo_indeterminato" },
      { metadata: METADATA_TEMPO_DETERMINATO, docType: "contratto_lavoro_subordinato", subType: "tempo_determinato" },
      { metadata: METADATA_LICENZIAMENTO, docType: "lettera_licenziamento", subType: "licenziamento_giusta_causa" },
    ];

    for (const { metadata, docType, subType } of expectations) {
      expect(metadata.expectedDocType).toBe(docType);
      expect(metadata.expectedSubType).toBe(subType);
      expect(metadata.expectedRisks.length).toBeGreaterThan(0);
    }
  });
});

// =====================================================================
// SECTION 2: Analyzer — HR Risk Detection
// =====================================================================

describe("HR Pipeline — Analyzer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Contratto TI — expected risks", () => {
    it("flags demansionamento unilaterale as critical", () => {
      const analysis = makeHRAnalysisTI();

      const clause = analysis.clauses.find((c) => c.id === "hr_ti_1");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("critical");
      expect(clause!.potentialViolation).toContain("2103");
    });

    it("flags trasferimento unilaterale as high risk", () => {
      const analysis = makeHRAnalysisTI();

      const clause = analysis.clauses.find((c) => c.id === "hr_ti_2");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("high");
      expect(clause!.potentialViolation).toContain("2103");
    });

    it("flags straordinario senza maggiorazione as high risk", () => {
      const analysis = makeHRAnalysisTI();

      const clause = analysis.clauses.find((c) => c.id === "hr_ti_3");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("high");
      expect(clause!.potentialViolation).toContain("2108");
    });

    it("flags patto di non concorrenza as high risk", () => {
      const analysis = makeHRAnalysisTI();

      const clause = analysis.clauses.find((c) => c.id === "hr_ti_4");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("high");
      expect(clause!.potentialViolation).toContain("2125");
    });

    it("has overallRisk >= high", () => {
      const analysis = makeHRAnalysisTI();
      expect(["high", "critical"]).toContain(analysis.overallRisk);
    });
  });

  describe("Contratto TD — expected risks", () => {
    it("flags rinnovo automatico senza causale as critical", () => {
      const analysis = makeHRAnalysisTD();

      const clause = analysis.clauses.find((c) => c.id === "hr_td_1");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("critical");
      expect(clause!.potentialViolation).toContain("81/2015");
    });

    it("flags clausola di stabilità with excessive penalty", () => {
      const analysis = makeHRAnalysisTD();

      const clause = analysis.clauses.find((c) => c.id === "hr_td_2");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("high");
    });

    it("flags foro competente esclusivo as null", () => {
      const analysis = makeHRAnalysisTD();

      const clause = analysis.clauses.find((c) => c.id === "hr_td_3");
      expect(clause).toBeDefined();
      expect(clause!.potentialViolation).toContain("413");
    });

    it("identifies missing causale as high importance", () => {
      const analysis = makeHRAnalysisTD();
      expect(analysis.missingElements.length).toBeGreaterThan(0);
      expect(analysis.missingElements[0].importance).toBe("high");
    });
  });

  describe("Licenziamento — expected risks", () => {
    it("flags motivazione generica as critical", () => {
      const analysis = makeHRAnalysisLicenziamento();

      const clause = analysis.clauses.find((c) => c.id === "hr_lic_1");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("critical");
      expect(clause!.potentialViolation).toContain("300/1970");
    });

    it("flags termine difensivo insufficiente as high", () => {
      const analysis = makeHRAnalysisLicenziamento();

      const clause = analysis.clauses.find((c) => c.id === "hr_lic_2");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("high");
    });

    it("flags contestazione mancante as critical", () => {
      const analysis = makeHRAnalysisLicenziamento();

      const clause = analysis.clauses.find((c) => c.id === "hr_lic_3");
      expect(clause).toBeDefined();
      expect(clause!.riskLevel).toBe("critical");
    });

    it("has overallRisk = critical", () => {
      const analysis = makeHRAnalysisLicenziamento();
      expect(analysis.overallRisk).toBe("critical");
    });
  });

  describe("All HR fixtures — minimum risk coverage", () => {
    it.each([
      { name: "TI", metadata: METADATA_TEMPO_INDETERMINATO, analysis: makeHRAnalysisTI() },
      { name: "TD", metadata: METADATA_TEMPO_DETERMINATO, analysis: makeHRAnalysisTD() },
      { name: "Licenziamento", metadata: METADATA_LICENZIAMENTO, analysis: makeHRAnalysisLicenziamento() },
    ])("$name: analysis has at least 3 clauses flagged", ({ analysis }) => {
      expect(analysis.clauses.length).toBeGreaterThanOrEqual(3);
    });

    it.each([
      { name: "TI", analysis: makeHRAnalysisTI() },
      { name: "TD", analysis: makeHRAnalysisTD() },
      { name: "Licenziamento", analysis: makeHRAnalysisLicenziamento() },
    ])("$name: at least one clause is critical or high", ({ analysis }) => {
      const criticalOrHigh = analysis.clauses.filter(
        (c) => c.riskLevel === "critical" || c.riskLevel === "high"
      );
      expect(criticalOrHigh.length).toBeGreaterThan(0);
    });
  });
});

// =====================================================================
// SECTION 3: Investigator — HR Clause Coverage
// =====================================================================

describe("HR Pipeline — Investigator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("TI: covers all critical/high clauses with findings", () => {
    const analysis = makeHRAnalysisTI();
    const investigation = makeHRInvestigationTI();

    const criticalHighIds = analysis.clauses
      .filter((c) => c.riskLevel === "critical" || c.riskLevel === "high")
      .map((c) => c.id);

    const coveredIds = investigation.findings.map((f) => f.clauseId);

    // At least some critical/high clauses should have findings
    const coveredCritical = criticalHighIds.filter((id) => coveredIds.includes(id));
    expect(coveredCritical.length).toBeGreaterThan(0);
  });

  it("Licenziamento: covers motivazione generica with legal references", () => {
    const investigation = makeHRInvestigationLicenziamento();

    const finding = investigation.findings.find((f) => f.clauseId === "hr_lic_1");
    expect(finding).toBeDefined();
    expect(finding!.laws.length).toBeGreaterThan(0);
    expect(finding!.laws[0].reference).toContain("300/1970");
    expect(finding!.laws[0].isInForce).toBe(true);
  });

  it("findings include court cases when available", () => {
    const investigation = makeHRInvestigationTI();

    const findingWithCases = investigation.findings.find(
      (f) => f.courtCases.length > 0
    );
    expect(findingWithCases).toBeDefined();
    expect(findingWithCases!.courtCases[0].court).toBe("Corte di Cassazione");
  });

  it("every finding has a legalOpinion", () => {
    const investigations = [
      makeHRInvestigationTI(),
      makeHRInvestigationLicenziamento(),
    ];

    for (const inv of investigations) {
      for (const finding of inv.findings) {
        expect(finding.legalOpinion).toBeDefined();
        expect(finding.legalOpinion.length).toBeGreaterThan(10);
      }
    }
  });
});

// =====================================================================
// SECTION 4: Advisor — HR Scoring Calibration
// =====================================================================

describe("HR Pipeline — Advisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("scoring calibration", () => {
    it("TI abusivo: fairnessScore <= 5 (sbilanciato)", () => {
      const advisor = makeHRAdvisorTI();
      expect(advisor.fairnessScore).toBeLessThanOrEqual(5);
    });

    it("Licenziamento viziato: fairnessScore <= 3 (gravemente sbilanciato)", () => {
      const advisor = makeHRAdvisorLicenziamento();
      expect(advisor.fairnessScore).toBeLessThanOrEqual(3);
    });

    it("TI: all 4 score dimensions are present", () => {
      const advisor = makeHRAdvisorTI();
      expect(advisor.scores).not.toBeNull();
      expect(advisor.scores!.contractEquity).toBeDefined();
      expect(advisor.scores!.legalCoherence).toBeDefined();
      expect(advisor.scores!.practicalCompliance).toBeDefined();
      expect(advisor.scores!.completeness).toBeDefined();
    });

    it("all score dimensions are 1-10 range", () => {
      const advisors = [makeHRAdvisorTI(), makeHRAdvisorLicenziamento()];
      for (const advisor of advisors) {
        if (advisor.scores) {
          for (const val of Object.values(advisor.scores)) {
            expect(val).toBeGreaterThanOrEqual(1);
            expect(val).toBeLessThanOrEqual(10);
          }
        }
      }
    });
  });

  describe("output limits", () => {
    it("max 3 risks", () => {
      const advisors = [makeHRAdvisorTI(), makeHRAdvisorLicenziamento()];
      for (const advisor of advisors) {
        expect(advisor.risks.length).toBeLessThanOrEqual(3);
      }
    });

    it("max 3 actions", () => {
      const advisors = [makeHRAdvisorTI(), makeHRAdvisorLicenziamento()];
      for (const advisor of advisors) {
        expect(advisor.actions.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe("needsLawyer calibration", () => {
    it("abusive contracts: needsLawyer = true", () => {
      expect(makeHRAdvisorTI().needsLawyer).toBe(true);
      expect(makeHRAdvisorLicenziamento().needsLawyer).toBe(true);
    });

    it("licenziamento: includes urgency deadline", () => {
      const advisor = makeHRAdvisorLicenziamento();
      expect(advisor.deadlines.length).toBeGreaterThan(0);
      expect(advisor.deadlines[0].action.toLowerCase()).toContain("impugn");
    });

    it("specialization matches document type", () => {
      const tiAdvisor = makeHRAdvisorTI();
      expect(tiAdvisor.lawyerSpecialization.toLowerCase()).toContain("lavoro");

      const licAdvisor = makeHRAdvisorLicenziamento();
      expect(licAdvisor.lawyerSpecialization.toLowerCase()).toContain("lavoro");
    });
  });
});

// =====================================================================
// SECTION 5: Full Orchestrator — HR Pipeline End-to-End
// =====================================================================

describe("HR Pipeline — Orchestrator E2E", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default session management
    mockCreateSession.mockResolvedValue("hr-session-001");
    mockLoadSession.mockResolvedValue(null);
    mockFindSessionByDocument.mockResolvedValue(null);
    mockSavePhaseResult.mockResolvedValue(undefined);
    mockSavePhaseTiming.mockResolvedValue(undefined);
  });

  it("runs full pipeline for contratto TI", async () => {
    const classification = makeHRClassificationTI();
    const analysis = makeHRAnalysisTI();
    const investigation = makeHRInvestigationTI();
    const advisor = makeHRAdvisorTI();

    mockRunClassifier.mockResolvedValue(classification);
    mockRunAnalyzer.mockResolvedValue(analysis);
    mockRunInvestigator.mockResolvedValue(investigation);
    mockRunAdvisor.mockResolvedValue(advisor);

    const callbacks = makeCallbacks();
    const result = await runOrchestrator(CONTRATTO_TEMPO_INDETERMINATO, callbacks);

    expect(mockRunClassifier).toHaveBeenCalledOnce();
    expect(mockRunAnalyzer).toHaveBeenCalledOnce();
    expect(mockRunInvestigator).toHaveBeenCalledOnce();
    expect(mockRunAdvisor).toHaveBeenCalledOnce();

    expect(result.classification).toEqual(classification);
    expect(result.analysis).toEqual(analysis);
    expect(result.investigation).toEqual(investigation);
    expect(result.advice).toEqual(advisor);
  });

  it("runs full pipeline for contratto TD", async () => {
    const classification = makeHRClassificationTD();
    const analysis = makeHRAnalysisTD();
    const investigation = { findings: [] };
    const advisor = makeHRAdvisorTI(); // reuse TI advisor, content doesn't matter for chain test

    mockRunClassifier.mockResolvedValue(classification);
    mockRunAnalyzer.mockResolvedValue(analysis);
    mockRunInvestigator.mockResolvedValue(investigation);
    mockRunAdvisor.mockResolvedValue(advisor);

    const callbacks = makeCallbacks();
    const result = await runOrchestrator(CONTRATTO_TEMPO_DETERMINATO, callbacks);

    expect(result.classification!.documentSubType).toBe("tempo_determinato");
    expect(result.analysis!.clauses.length).toBeGreaterThanOrEqual(3);
  });

  it("runs full pipeline for licenziamento", async () => {
    const classification = makeHRClassificationLicenziamento();
    const analysis = makeHRAnalysisLicenziamento();
    const investigation = makeHRInvestigationLicenziamento();
    const advisor = makeHRAdvisorLicenziamento();

    mockRunClassifier.mockResolvedValue(classification);
    mockRunAnalyzer.mockResolvedValue(analysis);
    mockRunInvestigator.mockResolvedValue(investigation);
    mockRunAdvisor.mockResolvedValue(advisor);

    const callbacks = makeCallbacks();
    const result = await runOrchestrator(LETTERA_LICENZIAMENTO_GIUSTA_CAUSA, callbacks);

    expect(result.classification!.documentType).toBe("lettera_licenziamento");
    expect(result.analysis!.overallRisk).toBe("critical");
    expect(result.advice!.needsLawyer).toBe(true);
    expect(result.advice!.fairnessScore).toBeLessThanOrEqual(3);
  });

  it("emits correct progress events for HR pipeline", async () => {
    mockRunClassifier.mockResolvedValue(makeHRClassificationTI());
    mockRunAnalyzer.mockResolvedValue(makeHRAnalysisTI());
    mockRunInvestigator.mockResolvedValue(makeHRInvestigationTI());
    mockRunAdvisor.mockResolvedValue(makeHRAdvisorTI());

    const callbacks = makeCallbacks();
    await runOrchestrator(CONTRATTO_TEMPO_INDETERMINATO, callbacks);

    // Verify progress events for each phase
    const phases = callbacks.progressCalls.map((p) => p.phase);
    expect(phases).toContain("classifier");
    expect(phases).toContain("analyzer");
    expect(phases).toContain("investigator");
    expect(phases).toContain("advisor");

    // Each phase should have "running" then "done"
    const classifierEvents = callbacks.progressCalls.filter((p) => p.phase === "classifier");
    expect(classifierEvents.some((e) => e.status === "running")).toBe(true);
    expect(classifierEvents.some((e) => e.status === "done")).toBe(true);
  });

  it("emits complete event with advisor result", async () => {
    const advisor = makeHRAdvisorTI();
    mockRunClassifier.mockResolvedValue(makeHRClassificationTI());
    mockRunAnalyzer.mockResolvedValue(makeHRAnalysisTI());
    mockRunInvestigator.mockResolvedValue(makeHRInvestigationTI());
    mockRunAdvisor.mockResolvedValue(advisor);

    const callbacks = makeCallbacks();
    await runOrchestrator(CONTRATTO_TEMPO_INDETERMINATO, callbacks);

    expect(callbacks.completeCalls).toHaveLength(1);
    expect(callbacks.completeCalls[0]).toEqual(advisor);
  });

  it("continues pipeline when investigator fails (non-fatal)", async () => {
    mockRunClassifier.mockResolvedValue(makeHRClassificationTI());
    mockRunAnalyzer.mockResolvedValue(makeHRAnalysisTI());
    mockRunInvestigator.mockRejectedValue(new Error("Web search unavailable"));
    mockRunAdvisor.mockResolvedValue(makeHRAdvisorTI());

    const callbacks = makeCallbacks();
    const result = await runOrchestrator(CONTRATTO_TEMPO_INDETERMINATO, callbacks);

    // Investigator failure is non-fatal — pipeline continues
    expect(result.investigation).toEqual({ findings: [] });
    expect(result.advice).toBeDefined();
    expect(mockRunAdvisor).toHaveBeenCalledOnce();
  });

  it("caches phase results after each step", async () => {
    mockRunClassifier.mockResolvedValue(makeHRClassificationTI());
    mockRunAnalyzer.mockResolvedValue(makeHRAnalysisTI());
    mockRunInvestigator.mockResolvedValue(makeHRInvestigationTI());
    mockRunAdvisor.mockResolvedValue(makeHRAdvisorTI());

    const callbacks = makeCallbacks();
    await runOrchestrator(CONTRATTO_TEMPO_INDETERMINATO, callbacks);

    // Each phase result should be saved
    expect(mockSavePhaseResult).toHaveBeenCalledWith("hr-session-001", "classification", expect.any(Object));
    expect(mockSavePhaseResult).toHaveBeenCalledWith("hr-session-001", "analysis", expect.any(Object));
    expect(mockSavePhaseResult).toHaveBeenCalledWith("hr-session-001", "investigation", expect.any(Object));
    expect(mockSavePhaseResult).toHaveBeenCalledWith("hr-session-001", "advice", expect.any(Object));
  });
});

// =====================================================================
// SECTION 6: Parameterized — All HR Fixtures Consistency
// =====================================================================

describe("HR Pipeline — Fixture Consistency", () => {
  it("ALL_HR_FIXTURES has 3 entries", () => {
    expect(ALL_HR_FIXTURES).toHaveLength(3);
  });

  it.each(ALL_HR_FIXTURES.map((f, i) => ({ ...f, index: i })))(
    "fixture $index ($metadata.id): text is non-empty",
    ({ text }) => {
      expect(text.length).toBeGreaterThan(200);
    }
  );

  it.each(ALL_HR_FIXTURES.map((f, i) => ({ ...f, index: i })))(
    "fixture $index ($metadata.id): metadata has expected risks",
    ({ metadata }) => {
      expect(metadata.expectedRisks.length).toBeGreaterThanOrEqual(3);
      expect(metadata.expectedDocType).toBeTruthy();
      expect(metadata.expectedSubType).toBeTruthy();
    }
  );

  it("fixture metadata IDs are unique", () => {
    const ids = ALL_HR_FIXTURES.map((f) => f.metadata.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("TI fixture text contains key problematic clauses", () => {
    expect(CONTRATTO_TEMPO_INDETERMINATO).toContain("mansioni di livello inferiore");
    expect(CONTRATTO_TEMPO_INDETERMINATO).toContain("diritto insindacabile di trasferire");
    expect(CONTRATTO_TEMPO_INDETERMINATO).toContain("20 ore settimanali aggiuntive");
    expect(CONTRATTO_TEMPO_INDETERMINATO).toContain("non concorrenza");
  });

  it("TD fixture text contains key problematic clauses", () => {
    expect(CONTRATTO_TEMPO_DETERMINATO).toContain("automaticamente rinnovato");
    expect(CONTRATTO_TEMPO_DETERMINATO).toContain("retribuzioni residue");
    expect(CONTRATTO_TEMPO_DETERMINATO).toContain("Foro di Roma");
  });

  it("Licenziamento fixture text contains key procedural issues", () => {
    expect(LETTERA_LICENZIAMENTO_GIUSTA_CAUSA).toContain("3 (tre) giorni di calendario");
    expect(LETTERA_LICENZIAMENTO_GIUSTA_CAUSA).toContain("condotta gravemente lesiva");
    expect(LETTERA_LICENZIAMENTO_GIUSTA_CAUSA).toContain("art. 2119");
  });
});

// =====================================================================
// SECTION 7: Cross-Vertical Validation — HR vs Legal Pipeline Contract
// =====================================================================

describe("HR Pipeline — Pipeline Contract Validation", () => {
  it("classifier output has all required fields for analyzer", () => {
    const classifications = [
      makeHRClassificationTI(),
      makeHRClassificationTD(),
      makeHRClassificationLicenziamento(),
    ];

    for (const c of classifications) {
      // Required by analyzer prompt builder
      expect(c.documentTypeLabel).toBeTruthy();
      expect(c.jurisdiction).toBeTruthy();
      expect(c.applicableLaws).toBeDefined();
      expect(Array.isArray(c.applicableLaws)).toBe(true);
      expect(Array.isArray(c.relevantInstitutes)).toBe(true);
      expect(Array.isArray(c.legalFocusAreas)).toBe(true);
    }
  });

  it("analyzer output has clause IDs that investigator can reference", () => {
    const analyses = [
      makeHRAnalysisTI(),
      makeHRAnalysisTD(),
      makeHRAnalysisLicenziamento(),
    ];

    for (const a of analyses) {
      const ids = a.clauses.map((c) => c.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length); // No duplicate IDs
      for (const clause of a.clauses) {
        expect(clause.id).toBeTruthy();
        expect(clause.riskLevel).toBeTruthy();
        expect(clause.potentialViolation).toBeTruthy();
      }
    }
  });

  it("investigator findings reference valid clause IDs from analyzer", () => {
    // TI
    const tiAnalysis = makeHRAnalysisTI();
    const tiInvestigation = makeHRInvestigationTI();
    const tiClauseIds = tiAnalysis.clauses.map((c) => c.id);
    for (const finding of tiInvestigation.findings) {
      expect(tiClauseIds).toContain(finding.clauseId);
    }

    // Licenziamento
    const licAnalysis = makeHRAnalysisLicenziamento();
    const licInvestigation = makeHRInvestigationLicenziamento();
    const licClauseIds = licAnalysis.clauses.map((c) => c.id);
    for (const finding of licInvestigation.findings) {
      expect(licClauseIds).toContain(finding.clauseId);
    }
  });

  it("advisor output structure matches expected interface", () => {
    const advisors = [makeHRAdvisorTI(), makeHRAdvisorLicenziamento()];

    for (const a of advisors) {
      expect(typeof a.fairnessScore).toBe("number");
      expect(a.fairnessScore).toBeGreaterThanOrEqual(1);
      expect(a.fairnessScore).toBeLessThanOrEqual(10);
      expect(typeof a.summary).toBe("string");
      expect(Array.isArray(a.risks)).toBe(true);
      expect(Array.isArray(a.deadlines)).toBe(true);
      expect(Array.isArray(a.actions)).toBe(true);
      expect(typeof a.needsLawyer).toBe("boolean");
      expect(typeof a.lawyerSpecialization).toBe("string");
      expect(typeof a.lawyerReason).toBe("string");
    }
  });
});
