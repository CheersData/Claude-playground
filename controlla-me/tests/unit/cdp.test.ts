import { describe, it, expect } from "vitest";

// ─── Data Cleanser (pure functions, no mocking needed) ───
import {
  normalizeDocumentType,
  normalizeRegion,
  normalizeEmail,
  extractEmailDomain,
  normalizeName,
  clampFairnessScore,
  clampPercentage,
  clampRate,
  validateDate,
  sanitizeText,
  deduplicateAndLimit,
  topByFrequency,
  cleanseAnalysisEvent,
} from "@/lib/cdp/data-cleanser";

// ─── Types — default factories ───
import {
  createDefaultIdentity,
  createDefaultBehavior,
  createDefaultRiskProfile,
  createDefaultPreferences,
  createDefaultLifecycle,
} from "@/lib/cdp/types";

// ─────────────────────────────────────────────────────
// Section 1: Default Factory Functions (types.ts)
// ─────────────────────────────────────────────────────

describe("CDP Default Factories", () => {
  describe("createDefaultIdentity", () => {
    it("returns valid identity with null optional fields", () => {
      const identity = createDefaultIdentity();

      expect(identity.email_domain).toBeNull();
      expect(identity.account_type).toBe("individual");
      expect(identity.inferred_sector).toBeNull();
      expect(identity.inferred_region).toBeNull();
      expect(identity.signup_source).toBe("organic");
    });

    it("returns a new object each call (no shared references)", () => {
      const a = createDefaultIdentity();
      const b = createDefaultIdentity();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe("createDefaultBehavior", () => {
    it("returns zeroed counters and empty arrays", () => {
      const behavior = createDefaultBehavior();

      expect(behavior.total_analyses).toBe(0);
      expect(behavior.analyses_last_30d).toBe(0);
      expect(behavior.avg_session_duration_ms).toBeNull();
      expect(behavior.preferred_doc_types).toEqual([]);
      expect(behavior.deep_search_rate).toBe(0);
      expect(behavior.corpus_queries).toBe(0);
      expect(behavior.last_active_at).toBeNull();
      expect(behavior.engagement_score).toBe(0);
    });

    it("returns a new object each call", () => {
      const a = createDefaultBehavior();
      const b = createDefaultBehavior();
      expect(a).not.toBe(b);
      expect(a.preferred_doc_types).not.toBe(b.preferred_doc_types);
    });
  });

  describe("createDefaultRiskProfile", () => {
    it("returns valid risk profile with null avg_fairness_score", () => {
      const risk = createDefaultRiskProfile();

      expect(risk.avg_fairness_score).toBeNull();
      expect(risk.risk_distribution).toEqual({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      });
      expect(risk.common_risk_areas).toEqual([]);
      expect(risk.needs_lawyer_rate).toBe(0);
      expect(risk.legal_literacy).toBe("low");
    });

    it("returns independent risk_distribution object each call", () => {
      const a = createDefaultRiskProfile();
      const b = createDefaultRiskProfile();
      expect(a.risk_distribution).not.toBe(b.risk_distribution);

      a.risk_distribution.critical = 5;
      expect(b.risk_distribution.critical).toBe(0);
    });
  });

  describe("createDefaultPreferences", () => {
    it("returns Italian language, no opt-in, empty interests", () => {
      const prefs = createDefaultPreferences();

      expect(prefs.preferred_language).toBe("it");
      expect(prefs.notification_opt_in).toBe(false);
      expect(prefs.lawyer_interest).toBe(false);
      expect(prefs.corpus_interests).toEqual([]);
    });
  });

  describe("createDefaultLifecycle", () => {
    it("returns 'new' stage with empty history", () => {
      const lifecycle = createDefaultLifecycle();

      expect(lifecycle.stage).toBe("new");
      expect(lifecycle.first_analysis_at).toBeNull();
      expect(lifecycle.plan_history).toEqual([]);
      expect(lifecycle.conversion_signals).toEqual([]);
      expect(lifecycle.churn_risk).toBe(0);
    });

    it("returns independent arrays each call", () => {
      const a = createDefaultLifecycle();
      const b = createDefaultLifecycle();
      expect(a.plan_history).not.toBe(b.plan_history);
      expect(a.conversion_signals).not.toBe(b.conversion_signals);
    });
  });
});

// ─────────────────────────────────────────────────────
// Section 2: Data Cleanser (data-cleanser.ts)
// ─────────────────────────────────────────────────────

describe("CDP Data Cleanser", () => {
  // ─── normalizeDocumentType ───

  describe("normalizeDocumentType", () => {
    it("maps known document type variants to canonical form", () => {
      expect(normalizeDocumentType("contratto_di_lavoro")).toBe("contratto_lavoro");
      expect(normalizeDocumentType("contratto di lavoro")).toBe("contratto_lavoro");
      expect(normalizeDocumentType("employment_contract")).toBe("contratto_lavoro");
      expect(normalizeDocumentType("contratto_lavoro_subordinato")).toBe("contratto_lavoro");
    });

    it("normalizes locazione variants", () => {
      expect(normalizeDocumentType("contratto_locazione")).toBe("locazione");
      expect(normalizeDocumentType("contratto_affitto")).toBe("locazione");
      expect(normalizeDocumentType("lease_agreement")).toBe("locazione");
      expect(normalizeDocumentType("locazione_abitativa")).toBe("locazione");
      expect(normalizeDocumentType("locazione_commerciale")).toBe("locazione");
    });

    it("maps space-separated inputs via underscore normalization", () => {
      // Spaces are replaced with underscores before lookup.
      // "contratto di lavoro" -> "contratto_di_lavoro" which IS a key in the map.
      expect(normalizeDocumentType("contratto di lavoro")).toBe("contratto_lavoro");
      // "contratto di vendita" -> "contratto_di_vendita" which is NOT a key,
      // so it falls through and returns the cleaned string as-is.
      // NOTE: the map has "contratto di locazione" (with spaces) as a key,
      // but since normalization replaces spaces with underscores first,
      // that key is unreachable. This is a known data inconsistency.
      expect(normalizeDocumentType("contratto di locazione")).toBe("contratto_di_locazione");
      expect(normalizeDocumentType("contratto di affitto")).toBe("contratto_di_affitto");
    });

    it("normalizes compravendita variants", () => {
      expect(normalizeDocumentType("contratto_vendita")).toBe("compravendita");
      expect(normalizeDocumentType("preliminare_vendita")).toBe("compravendita");
      expect(normalizeDocumentType("compravendita_immobiliare")).toBe("compravendita");
    });

    it("normalizes privacy and terms variants", () => {
      expect(normalizeDocumentType("privacy_policy")).toBe("privacy");
      expect(normalizeDocumentType("gdpr")).toBe("privacy");
      expect(normalizeDocumentType("terms_of_service")).toBe("termini_servizio");
      expect(normalizeDocumentType("condizioni_generali")).toBe("termini_servizio");
    });

    it("normalizes NDA variants", () => {
      expect(normalizeDocumentType("nda")).toBe("nda");
      expect(normalizeDocumentType("accordo_riservatezza")).toBe("nda");
      expect(normalizeDocumentType("non_disclosure")).toBe("nda");
    });

    it("returns lowercase original if not in mapping", () => {
      expect(normalizeDocumentType("Tipo Sconosciuto")).toBe("tipo_sconosciuto");
    });

    it("handles case-insensitive input with extra whitespace", () => {
      expect(normalizeDocumentType("  Contratto Di Lavoro  ")).toBe("contratto_lavoro");
      expect(normalizeDocumentType("PRIVACY_POLICY")).toBe("privacy");
    });

    it("returns null for null/undefined/empty input", () => {
      expect(normalizeDocumentType(null)).toBeNull();
      expect(normalizeDocumentType(undefined)).toBeNull();
      expect(normalizeDocumentType("")).toBeNull();
    });
  });

  // ─── normalizeRegion ───

  describe("normalizeRegion", () => {
    it("maps full region names to canonical keys", () => {
      expect(normalizeRegion("Lombardia")).toBe("lombardia");
      expect(normalizeRegion("lazio")).toBe("lazio");
      expect(normalizeRegion("Toscana")).toBe("toscana");
      expect(normalizeRegion("Piemonte")).toBe("piemonte");
    });

    it("maps city names and abbreviations to regions", () => {
      expect(normalizeRegion("Milano")).toBe("lombardia");
      expect(normalizeRegion("MI")).toBe("lombardia");
      expect(normalizeRegion("Roma")).toBe("lazio");
      expect(normalizeRegion("RM")).toBe("lazio");
      expect(normalizeRegion("Napoli")).toBe("campania");
      expect(normalizeRegion("Torino")).toBe("piemonte");
    });

    it("handles compound region names with hyphen or space", () => {
      expect(normalizeRegion("Emilia-Romagna")).toBe("emilia_romagna");
      expect(normalizeRegion("emilia romagna")).toBe("emilia_romagna");
      expect(normalizeRegion("Friuli-Venezia Giulia")).toBe("friuli_venezia_giulia");
      expect(normalizeRegion("friuli venezia giulia")).toBe("friuli_venezia_giulia");
      expect(normalizeRegion("Trentino-Alto Adige")).toBe("trentino_alto_adige");
      expect(normalizeRegion("Valle d'Aosta")).toBe("valle_daosta");
      expect(normalizeRegion("valle d aosta")).toBe("valle_daosta");
    });

    it("returns null for unknown regions", () => {
      expect(normalizeRegion("Bavaria")).toBeNull();
      expect(normalizeRegion("unknown")).toBeNull();
    });

    it("returns null for null/undefined/empty input", () => {
      expect(normalizeRegion(null)).toBeNull();
      expect(normalizeRegion(undefined)).toBeNull();
      expect(normalizeRegion("")).toBeNull();
    });

    it("handles whitespace in input", () => {
      expect(normalizeRegion("  lazio  ")).toBe("lazio");
    });
  });

  // ─── normalizeEmail ───

  describe("normalizeEmail", () => {
    it("normalizes valid email to lowercase", () => {
      expect(normalizeEmail("User@Example.COM")).toBe("user@example.com");
    });

    it("trims whitespace", () => {
      expect(normalizeEmail("  user@test.it  ")).toBe("user@test.it");
    });

    it("returns null for invalid emails", () => {
      expect(normalizeEmail("not-an-email")).toBeNull();
      expect(normalizeEmail("@missing-local.com")).toBeNull();
      expect(normalizeEmail("missing-at.com")).toBeNull();
      expect(normalizeEmail("no@dotafter")).toBeNull();
    });

    it("returns null for null/undefined/empty", () => {
      expect(normalizeEmail(null)).toBeNull();
      expect(normalizeEmail(undefined)).toBeNull();
      expect(normalizeEmail("")).toBeNull();
    });

    it("rejects emails with spaces in the local part", () => {
      expect(normalizeEmail("user name@example.com")).toBeNull();
    });
  });

  // ─── extractEmailDomain ───

  describe("extractEmailDomain", () => {
    it("extracts domain from valid email", () => {
      expect(extractEmailDomain("user@example.com")).toBe("example.com");
      expect(extractEmailDomain("CEO@Company.IT")).toBe("company.it");
    });

    it("returns null for invalid email", () => {
      expect(extractEmailDomain("notanemail")).toBeNull();
      expect(extractEmailDomain("")).toBeNull();
    });

    it("returns null for null/undefined", () => {
      expect(extractEmailDomain(null)).toBeNull();
      expect(extractEmailDomain(undefined)).toBeNull();
    });
  });

  // ─── normalizeName ───

  describe("normalizeName", () => {
    it("title-cases regular names", () => {
      expect(normalizeName("mario rossi")).toBe("Mario Rossi");
      expect(normalizeName("GIULIA VERDI")).toBe("Giulia Verdi");
    });

    it("handles Italian prefixes with apostrophe (apostrophe is stripped as dangerous char)", () => {
      // The sanitizer strips apostrophes via the [<>&"'] regex,
      // so "d'amico" becomes "damico" and title-cases to "Damico"
      expect(normalizeName("antonio d'amico")).toBe("Antonio Damico");
    });

    it("strips HTML tags", () => {
      expect(normalizeName("Mario <b>Rossi</b>")).toBe("Mario Rossi");
      expect(normalizeName("<script>alert(1)</script>Mario")).toBe("Alert(1)mario");
    });

    it("strips dangerous characters", () => {
      expect(normalizeName('Mario "Rossi" <test>')).toBe("Mario Rossi");
    });

    it("normalizes multiple spaces to single space", () => {
      expect(normalizeName("Mario   Rossi")).toBe("Mario Rossi");
    });

    it("returns null for null/undefined/empty/whitespace-only", () => {
      expect(normalizeName(null)).toBeNull();
      expect(normalizeName(undefined)).toBeNull();
      expect(normalizeName("")).toBeNull();
      expect(normalizeName("   ")).toBeNull();
    });

    it("returns null after stripping all special characters", () => {
      expect(normalizeName("<><>&\"'")).toBeNull();
    });
  });

  // ─── clampFairnessScore ───

  describe("clampFairnessScore", () => {
    it("clamps to range 1.0-10.0", () => {
      expect(clampFairnessScore(5.5)).toBe(5.5);
      expect(clampFairnessScore(0)).toBe(1.0);
      expect(clampFairnessScore(-5)).toBe(1.0);
      expect(clampFairnessScore(15)).toBe(10.0);
    });

    it("rounds to one decimal place", () => {
      expect(clampFairnessScore(7.777)).toBe(7.8);
      expect(clampFairnessScore(3.123)).toBe(3.1);
    });

    it("returns null for null/undefined/NaN", () => {
      expect(clampFairnessScore(null)).toBeNull();
      expect(clampFairnessScore(undefined)).toBeNull();
      expect(clampFairnessScore(NaN)).toBeNull();
    });

    it("handles boundary values", () => {
      expect(clampFairnessScore(1.0)).toBe(1.0);
      expect(clampFairnessScore(10.0)).toBe(10.0);
    });
  });

  // ─── clampPercentage ───

  describe("clampPercentage", () => {
    it("clamps to range 0-100 and rounds", () => {
      expect(clampPercentage(50)).toBe(50);
      expect(clampPercentage(-10)).toBe(0);
      expect(clampPercentage(150)).toBe(100);
      expect(clampPercentage(33.7)).toBe(34);
    });

    it("returns 0 for null/undefined/NaN", () => {
      expect(clampPercentage(null)).toBe(0);
      expect(clampPercentage(undefined)).toBe(0);
      expect(clampPercentage(NaN)).toBe(0);
    });

    it("handles boundary values", () => {
      expect(clampPercentage(0)).toBe(0);
      expect(clampPercentage(100)).toBe(100);
    });
  });

  // ─── clampRate ───

  describe("clampRate", () => {
    it("clamps to range 0.0-1.0 with two decimal places", () => {
      expect(clampRate(0.5)).toBe(0.5);
      expect(clampRate(-0.1)).toBe(0);
      expect(clampRate(1.5)).toBe(1.0);
      expect(clampRate(0.777)).toBe(0.78);
    });

    it("returns 0 for null/undefined/NaN", () => {
      expect(clampRate(null)).toBe(0);
      expect(clampRate(undefined)).toBe(0);
      expect(clampRate(NaN)).toBe(0);
    });

    it("handles boundary values", () => {
      expect(clampRate(0)).toBe(0);
      expect(clampRate(1.0)).toBe(1.0);
    });
  });

  // ─── validateDate ───

  describe("validateDate", () => {
    it("returns ISO string for a valid recent date", () => {
      const result = validateDate("2025-06-15T10:00:00Z");
      expect(result).toBe("2025-06-15T10:00:00.000Z");
    });

    it("returns null for dates before 2024", () => {
      expect(validateDate("2023-12-31T23:59:59Z")).toBeNull();
      expect(validateDate("2020-01-01T00:00:00Z")).toBeNull();
    });

    it("returns null for future dates", () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 2);
      expect(validateDate(futureDate.toISOString())).toBeNull();
    });

    it("returns null for invalid date strings", () => {
      expect(validateDate("not-a-date")).toBeNull();
      expect(validateDate("2025-13-45")).toBeNull();
    });

    it("returns null for null/undefined/empty", () => {
      expect(validateDate(null)).toBeNull();
      expect(validateDate(undefined)).toBeNull();
      expect(validateDate("")).toBeNull();
    });
  });

  // ─── sanitizeText ───

  describe("sanitizeText", () => {
    it("removes HTML tags", () => {
      expect(sanitizeText("<b>bold</b> text")).toBe("bold text");
      expect(sanitizeText("<script>alert('xss')</script>safe")).toBe("alert('xss')safe");
    });

    it("removes control characters except newline and tab", () => {
      expect(sanitizeText("hello\x00world")).toBe("helloworld");
      expect(sanitizeText("hello\x07bell")).toBe("hellobell");
    });

    it("normalizes whitespace", () => {
      expect(sanitizeText("too   many    spaces")).toBe("too many spaces");
    });

    it("truncates to maxLength", () => {
      const longText = "a".repeat(600);
      expect(sanitizeText(longText, 500)!.length).toBe(500);
      expect(sanitizeText(longText)!.length).toBe(500); // default maxLength
    });

    it("does not truncate text shorter than maxLength", () => {
      expect(sanitizeText("short text", 500)).toBe("short text");
    });

    it("returns null for null/undefined/empty/whitespace-only", () => {
      expect(sanitizeText(null)).toBeNull();
      expect(sanitizeText(undefined)).toBeNull();
      expect(sanitizeText("")).toBeNull();
      expect(sanitizeText("   ")).toBeNull();
    });

    it("returns null when only HTML tags and nothing else", () => {
      expect(sanitizeText("<br><hr>")).toBeNull();
    });

    it("respects custom maxLength", () => {
      expect(sanitizeText("hello world", 5)).toBe("hello");
    });
  });

  // ─── deduplicateAndLimit ───

  describe("deduplicateAndLimit", () => {
    it("removes duplicates (case-insensitive)", () => {
      expect(deduplicateAndLimit(["Privacy", "privacy", "PRIVACY"])).toEqual([
        "privacy",
      ]);
    });

    it("trims items", () => {
      expect(deduplicateAndLimit(["  hello  ", "hello"])).toEqual(["hello"]);
    });

    it("limits to maxItems", () => {
      const items = ["a", "b", "c", "d", "e", "f"];
      expect(deduplicateAndLimit(items, 3)).toEqual(["a", "b", "c"]);
    });

    it("filters out empty strings", () => {
      expect(deduplicateAndLimit(["valid", "", "  ", "other"])).toEqual([
        "valid",
        "other",
      ]);
    });

    it("handles empty array", () => {
      expect(deduplicateAndLimit([])).toEqual([]);
    });

    it("uses default limit of 10", () => {
      const items = Array.from({ length: 15 }, (_, i) => `item_${i}`);
      expect(deduplicateAndLimit(items)).toHaveLength(10);
    });
  });

  // ─── topByFrequency ───

  describe("topByFrequency", () => {
    it("returns items sorted by frequency descending", () => {
      const items = ["a", "b", "a", "c", "b", "a"];
      expect(topByFrequency(items, 3)).toEqual(["a", "b", "c"]);
    });

    it("limits to topN", () => {
      const items = ["a", "b", "c", "d"];
      expect(topByFrequency(items, 2)).toEqual(["a", "b"]);
    });

    it("normalizes items to lowercase and trims", () => {
      const items = ["  Test  ", "test", "TEST", "other"];
      expect(topByFrequency(items, 5)).toEqual(["test", "other"]);
    });

    it("skips empty strings", () => {
      const items = ["", "  ", "valid", ""];
      expect(topByFrequency(items, 5)).toEqual(["valid"]);
    });

    it("handles empty array", () => {
      expect(topByFrequency([], 5)).toEqual([]);
    });

    it("uses default topN of 5", () => {
      const items = Array.from({ length: 10 }, (_, i) => `type_${i}`);
      expect(topByFrequency(items)).toHaveLength(5);
    });
  });

  // ─── cleanseAnalysisEvent ───

  describe("cleanseAnalysisEvent", () => {
    it("normalizes all fields of a complete event", () => {
      const result = cleanseAnalysisEvent({
        document_type: "Contratto di Lavoro",
        document_sub_type: "tempo indeterminato",
        fairness_score: 7.3,
        overall_risk: "HIGH",
        needs_lawyer: true,
        jurisdiction: "Roma",
        clause_count: 12,
        critical_count: 2,
        high_count: 3,
      });

      expect(result.document_type).toBe("contratto_lavoro");
      expect(result.document_sub_type).toBe("tempo indeterminato");
      expect(result.fairness_score).toBe(7.3);
      expect(result.overall_risk).toBe("high");
      expect(result.needs_lawyer).toBe(true);
      expect(result.jurisdiction).toBe("Roma");
      expect(result.clause_count).toBe(12);
      expect(result.critical_count).toBe(2);
      expect(result.high_count).toBe(3);
    });

    it("handles empty/missing fields with safe defaults", () => {
      const result = cleanseAnalysisEvent({});

      expect(result.document_type).toBeNull();
      expect(result.document_sub_type).toBeNull();
      expect(result.fairness_score).toBeNull();
      expect(result.overall_risk).toBeNull();
      expect(result.needs_lawyer).toBe(false);
      expect(result.jurisdiction).toBeNull();
      expect(result.clause_count).toBe(0);
      expect(result.critical_count).toBe(0);
      expect(result.high_count).toBe(0);
    });

    it("rejects invalid overall_risk values", () => {
      expect(
        cleanseAnalysisEvent({ overall_risk: "extreme" }).overall_risk
      ).toBeNull();
      expect(
        cleanseAnalysisEvent({ overall_risk: "INVALID" }).overall_risk
      ).toBeNull();
    });

    it("accepts all valid risk levels", () => {
      expect(
        cleanseAnalysisEvent({ overall_risk: "critical" }).overall_risk
      ).toBe("critical");
      expect(
        cleanseAnalysisEvent({ overall_risk: "HIGH" }).overall_risk
      ).toBe("high");
      expect(
        cleanseAnalysisEvent({ overall_risk: "Medium" }).overall_risk
      ).toBe("medium");
      expect(
        cleanseAnalysisEvent({ overall_risk: "LOW" }).overall_risk
      ).toBe("low");
    });

    it("clamps fairness_score to 1-10 range", () => {
      expect(
        cleanseAnalysisEvent({ fairness_score: 0 }).fairness_score
      ).toBe(1.0);
      expect(
        cleanseAnalysisEvent({ fairness_score: 15 }).fairness_score
      ).toBe(10.0);
    });

    it("returns null fairness_score for NaN", () => {
      expect(
        cleanseAnalysisEvent({ fairness_score: NaN }).fairness_score
      ).toBeNull();
    });

    it("treats needs_lawyer as strict boolean (only true if literally true)", () => {
      expect(cleanseAnalysisEvent({ needs_lawyer: true }).needs_lawyer).toBe(true);
      expect(cleanseAnalysisEvent({ needs_lawyer: false }).needs_lawyer).toBe(false);
      // Truthy values that are not strictly `true` should become false
      expect(
        cleanseAnalysisEvent({ needs_lawyer: 1 as unknown as boolean }).needs_lawyer
      ).toBe(false);
      expect(
        cleanseAnalysisEvent({ needs_lawyer: "yes" as unknown as boolean }).needs_lawyer
      ).toBe(false);
    });

    it("floors negative counts to 0", () => {
      const result = cleanseAnalysisEvent({
        clause_count: -5,
        critical_count: -1,
        high_count: -3,
      });
      expect(result.clause_count).toBe(0);
      expect(result.critical_count).toBe(0);
      expect(result.high_count).toBe(0);
    });

    it("floors fractional counts", () => {
      const result = cleanseAnalysisEvent({
        clause_count: 5.9,
        critical_count: 2.1,
        high_count: 3.5,
      });
      expect(result.clause_count).toBe(5);
      expect(result.critical_count).toBe(2);
      expect(result.high_count).toBe(3);
    });

    it("sanitizes document_sub_type and jurisdiction as text (max 100 chars)", () => {
      const longText = "x".repeat(200);
      const result = cleanseAnalysisEvent({
        document_sub_type: longText,
        jurisdiction: longText,
      });
      expect(result.document_sub_type!.length).toBe(100);
      expect(result.jurisdiction!.length).toBe(100);
    });

    it("strips HTML from document_sub_type", () => {
      const result = cleanseAnalysisEvent({
        document_sub_type: "<b>tempo determinato</b>",
      });
      expect(result.document_sub_type).toBe("tempo determinato");
    });
  });
});
