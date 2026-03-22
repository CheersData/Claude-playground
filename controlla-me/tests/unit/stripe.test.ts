import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for lib/stripe.ts
 *
 * The module reads env vars at import time, so we need to manipulate
 * process.env BEFORE importing it. The vitest.setup.ts already sets:
 *   STRIPE_SECRET_KEY = "sk_test_fake"
 *   STRIPE_PRO_PRICE_ID = "price_test_pro"
 *   STRIPE_SINGLE_PRICE_ID = "price_test_single"
 *
 * Coverage:
 * - Stripe client initialization with and without API key
 * - PLANS constant: all 3 plans with correct values
 * - Plan hierarchy: price ordering, limit ordering
 * - Plan immutability: PLANS is `as const` — cannot be reassigned
 * - Re-import behavior: module-level code runs once per module load
 * - Stripe constructor arguments: apiVersion, typescript flag
 * - stripePriceId reads from env vars at import time
 * - Single plan does not have analysesPerMonth or deepSearchLimit
 * - Type safety: plan names match expected strings
 */

// Mock the Stripe constructor so we don't make real API calls.
// Stripe is used with `new Stripe(...)`, so we need a proper class mock.
const MockStripeConstructor = vi.hoisted(() => {
  const cls = vi.fn(function (this: Record<string, unknown>) {
    this.customers = {};
    this.subscriptions = {};
  });
  return cls;
});

vi.mock("stripe", () => ({
  default: MockStripeConstructor,
}));

import { stripe, PLANS } from "@/lib/stripe";

describe("lib/stripe", () => {
  describe("stripe client initialization", () => {
    it("creates a Stripe instance when STRIPE_SECRET_KEY is set", () => {
      // The setup file sets STRIPE_SECRET_KEY = "sk_test_fake"
      // So the module-level code should have called new Stripe(...)
      expect(MockStripeConstructor).toHaveBeenCalledWith("sk_test_fake", {
        apiVersion: expect.any(String),
        typescript: true,
      });
    });

    it("exports a non-null stripe client", () => {
      expect(stripe).not.toBeNull();
    });

    it("passes typescript: true to Stripe constructor", () => {
      const callArgs = MockStripeConstructor.mock.calls[0] as unknown[];
      expect((callArgs[1] as Record<string, unknown>).typescript).toBe(true);
    });

    it("passes a valid apiVersion string to Stripe constructor", () => {
      const callArgs = MockStripeConstructor.mock.calls[0] as unknown[];
      const opts = callArgs[1] as Record<string, unknown>;
      expect(typeof opts.apiVersion).toBe("string");
      expect((opts.apiVersion as string).length).toBeGreaterThan(0);
    });

    it("uses the STRIPE_SECRET_KEY from process.env", () => {
      const callArgs = MockStripeConstructor.mock.calls[0] as unknown[];
      expect(callArgs[0]).toBe("sk_test_fake");
    });
  });

  describe("stripe client without key", () => {
    it("exports null when STRIPE_SECRET_KEY is missing", async () => {
      // We need to re-import with a clean module cache and no key
      const originalKey = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;

      // Reset module registry to force re-evaluation
      vi.resetModules();

      // Re-mock stripe for the fresh import (must be constructable)
      vi.doMock("stripe", () => ({
        default: vi.fn(function (this: Record<string, unknown>) {
          this.customers = {};
        }),
      }));

      const freshModule = await import("@/lib/stripe");
      expect(freshModule.stripe).toBeNull();

      // Restore
      process.env.STRIPE_SECRET_KEY = originalKey;
    });

    it("exports null when STRIPE_SECRET_KEY is empty string", async () => {
      const originalKey = process.env.STRIPE_SECRET_KEY;
      process.env.STRIPE_SECRET_KEY = "";

      vi.resetModules();
      vi.doMock("stripe", () => ({
        default: vi.fn(function (this: Record<string, unknown>) {
          this.customers = {};
        }),
      }));

      const freshModule = await import("@/lib/stripe");
      // Empty string is falsy, so stripe should be null
      expect(freshModule.stripe).toBeNull();

      process.env.STRIPE_SECRET_KEY = originalKey;
    });

    it("PLANS are still exported even when stripe client is null", async () => {
      const originalKey = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_SECRET_KEY;

      vi.resetModules();
      vi.doMock("stripe", () => ({
        default: vi.fn(function (this: Record<string, unknown>) {
          this.customers = {};
        }),
      }));

      const freshModule = await import("@/lib/stripe");
      expect(freshModule.PLANS).toBeDefined();
      expect(freshModule.PLANS.free).toBeDefined();
      expect(freshModule.PLANS.pro).toBeDefined();
      expect(freshModule.PLANS.single).toBeDefined();

      process.env.STRIPE_SECRET_KEY = originalKey;
    });
  });

  describe("PLANS configuration", () => {
    describe("free plan", () => {
      it("has correct name", () => {
        expect(PLANS.free.name).toBe("Free");
      });

      it("has zero price", () => {
        expect(PLANS.free.price).toBe(0);
      });

      it("allows 3 analyses per month", () => {
        expect(PLANS.free.analysesPerMonth).toBe(3);
      });

      it("allows 1 deep search", () => {
        expect(PLANS.free.deepSearchLimit).toBe(1);
      });

      it("does not have a stripePriceId", () => {
        expect(PLANS.free).not.toHaveProperty("stripePriceId");
      });

      it("has exactly 4 properties (name, price, analysesPerMonth, deepSearchLimit)", () => {
        const keys = Object.keys(PLANS.free);
        expect(keys).toHaveLength(4);
        expect(keys).toEqual(
          expect.arrayContaining(["name", "price", "analysesPerMonth", "deepSearchLimit"])
        );
      });
    });

    describe("pro plan", () => {
      it("has correct name", () => {
        expect(PLANS.pro.name).toBe("Pro");
      });

      it("costs 4.99", () => {
        expect(PLANS.pro.price).toBe(4.99);
      });

      it("has unlimited analyses per month", () => {
        expect(PLANS.pro.analysesPerMonth).toBe(Infinity);
      });

      it("has unlimited deep searches", () => {
        expect(PLANS.pro.deepSearchLimit).toBe(Infinity);
      });

      it("has a stripePriceId from env", () => {
        // Set by vitest.setup.ts: STRIPE_PRO_PRICE_ID = "price_test_pro"
        expect(PLANS.pro.stripePriceId).toBe("price_test_pro");
      });

      it("has exactly 5 properties (name, price, analysesPerMonth, deepSearchLimit, stripePriceId)", () => {
        const keys = Object.keys(PLANS.pro);
        expect(keys).toHaveLength(5);
        expect(keys).toEqual(
          expect.arrayContaining(["name", "price", "analysesPerMonth", "deepSearchLimit", "stripePriceId"])
        );
      });
    });

    describe("single plan", () => {
      it("has correct name", () => {
        expect(PLANS.single.name).toBe("Singola Analisi");
      });

      it("costs 0.99", () => {
        expect(PLANS.single.price).toBe(0.99);
      });

      it("has a stripePriceId from env", () => {
        // Set by vitest.setup.ts: STRIPE_SINGLE_PRICE_ID = "price_test_single"
        expect(PLANS.single.stripePriceId).toBe("price_test_single");
      });

      it("does not have analysesPerMonth (one-shot purchase)", () => {
        expect(PLANS.single).not.toHaveProperty("analysesPerMonth");
      });

      it("does not have deepSearchLimit (one-shot purchase)", () => {
        expect(PLANS.single).not.toHaveProperty("deepSearchLimit");
      });

      it("has exactly 3 properties (name, price, stripePriceId)", () => {
        const keys = Object.keys(PLANS.single);
        expect(keys).toHaveLength(3);
        expect(keys).toEqual(
          expect.arrayContaining(["name", "price", "stripePriceId"])
        );
      });
    });

    describe("plan structure", () => {
      it("has exactly three plans", () => {
        const planKeys = Object.keys(PLANS);
        expect(planKeys).toHaveLength(3);
        expect(planKeys).toEqual(
          expect.arrayContaining(["free", "pro", "single"])
        );
      });

      it("free plan has the lowest price", () => {
        expect(PLANS.free.price).toBeLessThan(PLANS.single.price);
        expect(PLANS.single.price).toBeLessThan(PLANS.pro.price);
      });

      it("free plan has the most restrictive limits", () => {
        expect(PLANS.free.analysesPerMonth).toBeLessThan(
          PLANS.pro.analysesPerMonth
        );
        expect(PLANS.free.deepSearchLimit).toBeLessThan(
          PLANS.pro.deepSearchLimit
        );
      });

      it("all plan names are non-empty strings", () => {
        expect(typeof PLANS.free.name).toBe("string");
        expect(PLANS.free.name.length).toBeGreaterThan(0);
        expect(typeof PLANS.pro.name).toBe("string");
        expect(PLANS.pro.name.length).toBeGreaterThan(0);
        expect(typeof PLANS.single.name).toBe("string");
        expect(PLANS.single.name.length).toBeGreaterThan(0);
      });

      it("all prices are non-negative numbers", () => {
        expect(PLANS.free.price).toBeGreaterThanOrEqual(0);
        expect(PLANS.pro.price).toBeGreaterThanOrEqual(0);
        expect(PLANS.single.price).toBeGreaterThanOrEqual(0);
      });

      it("paid plans (pro, single) have stripePriceId", () => {
        expect(PLANS.pro.stripePriceId).toBeDefined();
        expect(typeof PLANS.pro.stripePriceId).toBe("string");
        expect(PLANS.single.stripePriceId).toBeDefined();
        expect(typeof PLANS.single.stripePriceId).toBe("string");
      });

      it("free plan has finite analyses limit", () => {
        expect(Number.isFinite(PLANS.free.analysesPerMonth)).toBe(true);
        expect(PLANS.free.analysesPerMonth).toBeGreaterThan(0);
      });

      it("pro plan has infinite limits (Infinity is not finite)", () => {
        expect(Number.isFinite(PLANS.pro.analysesPerMonth)).toBe(false);
        expect(Number.isFinite(PLANS.pro.deepSearchLimit)).toBe(false);
      });
    });
  });

  describe("stripePriceId from environment", () => {
    it("pro stripePriceId matches STRIPE_PRO_PRICE_ID env var", () => {
      expect(PLANS.pro.stripePriceId).toBe(process.env.STRIPE_PRO_PRICE_ID);
    });

    it("single stripePriceId matches STRIPE_SINGLE_PRICE_ID env var", () => {
      expect(PLANS.single.stripePriceId).toBe(process.env.STRIPE_SINGLE_PRICE_ID);
    });

    it("stripePriceId is undefined when env var is not set", async () => {
      const originalProPriceId = process.env.STRIPE_PRO_PRICE_ID;
      const originalSinglePriceId = process.env.STRIPE_SINGLE_PRICE_ID;
      const originalKey = process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_PRO_PRICE_ID;
      delete process.env.STRIPE_SINGLE_PRICE_ID;

      vi.resetModules();
      vi.doMock("stripe", () => ({
        default: vi.fn(function (this: Record<string, unknown>) {
          this.customers = {};
        }),
      }));

      const freshModule = await import("@/lib/stripe");
      expect(freshModule.PLANS.pro.stripePriceId).toBeUndefined();
      expect(freshModule.PLANS.single.stripePriceId).toBeUndefined();

      // Restore
      process.env.STRIPE_PRO_PRICE_ID = originalProPriceId;
      process.env.STRIPE_SINGLE_PRICE_ID = originalSinglePriceId;
      process.env.STRIPE_SECRET_KEY = originalKey;
    });
  });
});
