/**
 * Tests: Similarity Engine — L2 Levenshtein distance for field mapping.
 *
 * Covers:
 * - levenshteinDistance basic cases (same=0, empty, insertions, deletions)
 * - resolveBySimilarity finds close matches above threshold
 * - resolveBySimilarity returns null below threshold
 * - normalization (camelCase, underscores stripped)
 * - resolveBatchBySimilarity with deduplication
 *
 * Pure functions — no mocks needed.
 */

import { describe, it, expect } from "vitest";

import {
  levenshteinDistance,
  resolveBySimilarity,
  resolveBatchBySimilarity,
} from "@/lib/staff/data-connector/mapping/similarity";

// =============================================================================
// levenshteinDistance — basic cases
// =============================================================================

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
  });

  it("returns 0 for two empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
  });

  it("returns length of non-empty string when other is empty", () => {
    expect(levenshteinDistance("hello", "")).toBe(5);
    expect(levenshteinDistance("", "world")).toBe(5);
  });

  it("returns 1 for single insertion", () => {
    expect(levenshteinDistance("cat", "cats")).toBe(1);
  });

  it("returns 1 for single deletion", () => {
    expect(levenshteinDistance("cats", "cat")).toBe(1);
  });

  it("returns 1 for single substitution", () => {
    expect(levenshteinDistance("cat", "car")).toBe(1);
  });

  it("returns correct distance for 'kitten' -> 'sitting'", () => {
    // kitten -> sitten (substitution) -> sittin (substitution) -> sitting (insertion) = 3
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });

  it("returns correct distance for 'saturday' -> 'sunday'", () => {
    expect(levenshteinDistance("saturday", "sunday")).toBe(3);
  });

  it("is symmetric (distance a->b == distance b->a)", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(
      levenshteinDistance("xyz", "abc")
    );
    expect(levenshteinDistance("hello", "world")).toBe(
      levenshteinDistance("world", "hello")
    );
  });

  it("returns full length for completely different single-char strings", () => {
    expect(levenshteinDistance("a", "b")).toBe(1);
  });

  it("handles single character strings", () => {
    expect(levenshteinDistance("a", "a")).toBe(0);
    expect(levenshteinDistance("a", "")).toBe(1);
  });
});

// =============================================================================
// resolveBySimilarity — finds close matches
// =============================================================================

describe("resolveBySimilarity", () => {
  const targetFields = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "company_name",
    "address",
    "city",
    "country",
    "created_at",
    "updated_at",
  ];

  it("finds exact match with score 1.0", () => {
    const result = resolveBySimilarity("first_name", targetFields);

    expect(result).not.toBeNull();
    expect(result!.field).toBe("first_name");
    expect(result!.score).toBe(1.0);
  });

  it("finds close match above threshold", () => {
    // "firstname" (no underscore) should match "first_name"
    // After normalization both become "first_name" (exact match)
    const result = resolveBySimilarity("firstname", targetFields);

    expect(result).not.toBeNull();
    expect(result!.field).toBe("first_name");
    expect(result!.score).toBeGreaterThanOrEqual(0.8);
  });

  it("normalizes camelCase source fields", () => {
    // "firstName" -> "first_name" after normalization
    const result = resolveBySimilarity("firstName", targetFields);

    expect(result).not.toBeNull();
    expect(result!.field).toBe("first_name");
    expect(result!.score).toBe(1.0);
  });

  it("normalizes camelCase target fields", () => {
    const camelTargets = ["firstName", "lastName", "emailAddress"];
    // "first_name" -> compared against normalized "first_name"
    const result = resolveBySimilarity("first_name", camelTargets);

    expect(result).not.toBeNull();
    expect(result!.field).toBe("firstName");
    expect(result!.score).toBe(1.0);
  });

  it("returns null when no match above threshold", () => {
    const result = resolveBySimilarity("zzz_completely_different_field", targetFields);

    expect(result).toBeNull();
  });

  it("returns null for empty source field against non-empty targets", () => {
    // Empty string normalized is empty, distance is large vs any target
    const result = resolveBySimilarity("", targetFields, 0.8);

    // Should be null since similarity would be 0
    expect(result).toBeNull();
  });

  it("returns null for empty targets array", () => {
    const result = resolveBySimilarity("first_name", []);

    expect(result).toBeNull();
  });

  it("respects custom threshold", () => {
    // With very low threshold, even poor matches should pass
    const result = resolveBySimilarity("xmail", targetFields, 0.3);

    expect(result).not.toBeNull();
  });

  it("returns null with very high threshold for imperfect match", () => {
    // "mail" is close to "email" but may not be 0.95+ similar
    const result = resolveBySimilarity("mail", targetFields, 0.99);

    // Only exact matches would pass 0.99
    expect(result).toBeNull();
  });

  it("returns the best match when multiple targets are similar", () => {
    const targets = ["first_name", "first_names", "first_named"];
    const result = resolveBySimilarity("first_name", targets);

    expect(result).not.toBeNull();
    expect(result!.field).toBe("first_name");
    expect(result!.score).toBe(1.0);
  });

  it("score is rounded to 2 decimal places", () => {
    const result = resolveBySimilarity("emai", targetFields, 0.5);

    if (result) {
      const decimals = result.score.toString().split(".")[1] ?? "";
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });
});

// =============================================================================
// resolveBatchBySimilarity — batch with deduplication
// =============================================================================

describe("resolveBatchBySimilarity", () => {
  const targetFields = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "company_name",
  ];

  it("resolves multiple source fields in batch", () => {
    const result = resolveBatchBySimilarity(
      ["firstName", "lastName", "email"],
      targetFields
    );

    expect(result.size).toBe(3);
    expect(result.get("firstName")!.field).toBe("first_name");
    expect(result.get("lastName")!.field).toBe("last_name");
    expect(result.get("email")!.field).toBe("email");
  });

  it("deduplicates: same target is not assigned to two sources", () => {
    // Both "nome" and "first_name" would match "first_name"
    // But deduplication should only assign it to the best match
    const result = resolveBatchBySimilarity(
      ["first_name", "firstname"],
      targetFields
    );

    // Both resolve to "first_name" after normalization, but only one should get it
    const assignedTargets = new Set(
      Array.from(result.values()).map((v) => v.field)
    );
    // Each target should appear at most once
    expect(assignedTargets.size).toBe(result.size);
  });

  it("returns empty map for empty source fields", () => {
    const result = resolveBatchBySimilarity([], targetFields);
    expect(result.size).toBe(0);
  });

  it("returns empty map for empty target fields", () => {
    const result = resolveBatchBySimilarity(["first_name"], []);
    expect(result.size).toBe(0);
  });

  it("skips source fields that are below threshold", () => {
    const result = resolveBatchBySimilarity(
      ["first_name", "zzz_unknown_xyz"],
      targetFields
    );

    expect(result.has("first_name")).toBe(true);
    expect(result.has("zzz_unknown_xyz")).toBe(false);
  });

  it("respects custom threshold", () => {
    // With threshold 1.0, only exact (after normalization) matches
    const result = resolveBatchBySimilarity(
      ["first_name", "emai"],
      targetFields,
      1.0
    );

    expect(result.has("first_name")).toBe(true);
    expect(result.has("emai")).toBe(false); // not exact match
  });
});
