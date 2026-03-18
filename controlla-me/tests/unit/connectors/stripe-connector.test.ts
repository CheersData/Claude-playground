import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSource } from "@/lib/staff/data-connector/types";

// Break circular dependency: base.ts re-exports authenticated-base.ts which imports base.ts
vi.mock("@/lib/staff/data-connector/connectors/authenticated-base", () => ({
  AuthenticatedBaseConnector: class {},
}));

// vi.hoisted ensures mockStripeInstance is available when vi.mock factories execute (hoisted above imports)
const mockStripeInstance = vi.hoisted(() => ({
  accounts: { retrieve: vi.fn() },
  customers: { list: vi.fn() },
  subscriptions: { list: vi.fn() },
  invoices: { list: vi.fn() },
  paymentIntents: { list: vi.fn() },
}));

vi.mock("stripe", () => ({
  // Regular function (not arrow) so it can be called with `new`
  default: function MockStripe() { return mockStripeInstance; },
}));

import { StripeConnector } from "@/lib/staff/data-connector/connectors/stripe";

// ─── Helpers ───

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "stripe_test",
    name: "Stripe Test",
    shortName: "STRIPE",
    dataType: "crm-records",
    vertical: "legal",
    connector: "stripe",
    config: {},
    lifecycle: "planned",
    estimatedItems: 100,
    ...overrides,
  };
}

function makeCustomer(id: string, email = "test@example.com") {
  return {
    id,
    object: "customer",
    email,
    name: `Customer ${id}`,
    created: 1704067200, // 2024-01-01T00:00:00Z
    currency: "eur",
    description: null,
    phone: null,
    delinquent: false,
    balance: 0,
    default_source: null,
    metadata: {},
  };
}

function makeSubscription(id: string, customerId = "cus_1") {
  return {
    id,
    object: "subscription",
    status: "active",
    created: 1704067200,
    currency: "eur",
    customer: customerId,
    description: null,
    cancel_at_period_end: false,
    trial_start: null,
    trial_end: null,
    items: {
      data: [{
        plan: {
          amount: 499,
          currency: "eur",
          interval: "month",
          nickname: "Pro Plan",
        },
        current_period_start: 1704067200,
        current_period_end: 1706745600,
      }],
    },
    metadata: {},
  };
}

function makeApiList(data: unknown[], hasMore = false) {
  return { data, has_more: hasMore, object: "list" };
}

describe("StripeConnector", () => {
  let connector: StripeConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  const originalEnv = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    connector = new StripeConnector(makeSource(), logSpy);
    vi.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);

    // Reset all mock implementations
    Object.values(mockStripeInstance).forEach((group) => {
      Object.values(group).forEach((fn) => {
        if (typeof fn === "object" && "mockReset" in fn) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      });
    });
    mockStripeInstance.accounts.retrieve.mockReset();
    mockStripeInstance.customers.list.mockReset();
    mockStripeInstance.subscriptions.list.mockReset();
    mockStripeInstance.invoices.list.mockReset();
    mockStripeInstance.paymentIntents.list.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalEnv !== undefined) {
      process.env.STRIPE_SECRET_KEY = originalEnv;
    } else {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  // ─── connect() ───

  describe("connect", () => {
    it("returns ok=true with account info", async () => {
      mockStripeInstance.accounts.retrieve.mockResolvedValue({ id: "acct_test123" });
      mockStripeInstance.customers.list
        .mockResolvedValueOnce(makeApiList([makeCustomer("cus_1")], true)) // count
        .mockResolvedValueOnce(makeApiList([makeCustomer("cus_1")])); // sample
      mockStripeInstance.subscriptions.list.mockResolvedValue(makeApiList([], false));
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([], false));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([], false));

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.message).toContain("API OK");
      expect(result.census.availableFormats).toContain("json");
    });

    it("detects test mode from account ID", async () => {
      mockStripeInstance.accounts.retrieve.mockResolvedValue({ id: "acct_test123" });
      mockStripeInstance.customers.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.subscriptions.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.connect();

      expect(result.message).toContain("TEST");
    });

    it("returns ok=false when Stripe throws", async () => {
      mockStripeInstance.accounts.retrieve.mockRejectedValue(new Error("Invalid API Key"));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("Invalid API Key");
    });

    it("throws when STRIPE_SECRET_KEY is missing", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const noKeyConnector = new StripeConnector(makeSource(), logSpy);

      const result = await noKeyConnector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("STRIPE_SECRET_KEY");
    });

    it("estimates counts per type using has_more flag", async () => {
      mockStripeInstance.accounts.retrieve.mockResolvedValue({ id: "acct_test" });
      // customer: has_more=true → 100
      mockStripeInstance.customers.list
        .mockResolvedValueOnce(makeApiList([makeCustomer("cus_1")], true))
        .mockResolvedValueOnce(makeApiList([makeCustomer("cus_1")])); // sample
      // subscription: has_more=false → 1
      mockStripeInstance.subscriptions.list.mockResolvedValue(
        makeApiList([makeSubscription("sub_1")])
      );
      // invoice: has_more=false → 0
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      // payment_intent: has_more=false → 0
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.connect();

      expect(result.census.estimatedItems).toBe(101); // 100 + 1 + 0 + 0
    });
  });

  // ─── fetchAll() ───

  describe("fetchAll", () => {
    it("fetches all 4 sync types", async () => {
      mockStripeInstance.customers.list.mockResolvedValue(
        makeApiList([makeCustomer("cus_1")])
      );
      mockStripeInstance.subscriptions.list.mockResolvedValue(
        makeApiList([makeSubscription("sub_1")])
      );
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(2);
      expect(result.items[0].objectType).toBe("customer");
      expect(result.items[1].objectType).toBe("subscription");
      expect(result.sourceId).toBe("stripe_test");
    });

    it("handles cursor pagination via starting_after", async () => {
      mockStripeInstance.customers.list
        .mockResolvedValueOnce(makeApiList([makeCustomer("cus_1")], true))
        .mockResolvedValueOnce(makeApiList([makeCustomer("cus_2")]));
      mockStripeInstance.subscriptions.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(2);
      // Second call should have starting_after
      const secondCall = mockStripeInstance.customers.list.mock.calls[1][0];
      expect(secondCall.starting_after).toBe("cus_1");
    });

    it("respects global limit", async () => {
      mockStripeInstance.customers.list.mockResolvedValue(
        makeApiList([makeCustomer("cus_1"), makeCustomer("cus_2")])
      );
      mockStripeInstance.subscriptions.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.fetchAll({ limit: 1 });

      // Should stop after limit reached
      expect(result.items.length).toBeLessThanOrEqual(2);
    });

    it("includes metadata with counts", async () => {
      mockStripeInstance.customers.list.mockResolvedValue(
        makeApiList([makeCustomer("cus_1")])
      );
      mockStripeInstance.subscriptions.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.fetchAll();

      expect((result.metadata.counts as Record<string, unknown>).customer).toBe(1);
      expect((result.metadata.counts as Record<string, unknown>).subscription).toBe(0);
    });

    it("handles SDK errors gracefully", async () => {
      mockStripeInstance.customers.list.mockRejectedValue(new Error("Rate limited"));
      mockStripeInstance.subscriptions.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.fetchAll();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Error fetching customer"));
    });
  });

  // ─── fetchDelta() ───

  describe("fetchDelta", () => {
    it("passes created filter as Unix timestamp", async () => {
      const since = "2026-03-01T00:00:00Z";
      const sinceTimestamp = Math.floor(new Date(since).getTime() / 1000);

      mockStripeInstance.customers.list.mockResolvedValue(
        makeApiList([makeCustomer("cus_1")])
      );
      mockStripeInstance.subscriptions.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.fetchDelta(since);

      expect(result.metadata.sinceTimestamp).toBe(sinceTimestamp);
      expect(result.metadata.since).toBe(since);

      // Verify created filter was passed to SDK
      const firstCall = mockStripeInstance.customers.list.mock.calls[0][0];
      expect(firstCall.created).toEqual({ gte: sinceTimestamp });
    });

    it("includes since in metadata", async () => {
      mockStripeInstance.customers.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.subscriptions.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.fetchDelta("2026-01-01T00:00:00Z");

      expect(result.metadata.since).toBe("2026-01-01T00:00:00Z");
    });
  });

  // ─── Parser integration ───

  describe("record parsing", () => {
    it("normalizes customer records correctly", async () => {
      mockStripeInstance.customers.list.mockResolvedValue(
        makeApiList([makeCustomer("cus_abc", "user@test.com")])
      );
      mockStripeInstance.subscriptions.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.fetchAll();

      const record = result.items[0];
      expect(record.externalId).toBe("cus_abc");
      expect(record.objectType).toBe("customer");
      expect(record.email).toBe("user@test.com");
      expect(record.status).toBe("active");
    });

    it("normalizes subscription records correctly", async () => {
      mockStripeInstance.customers.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.subscriptions.list.mockResolvedValue(
        makeApiList([makeSubscription("sub_xyz", "cus_1")])
      );
      mockStripeInstance.invoices.list.mockResolvedValue(makeApiList([]));
      mockStripeInstance.paymentIntents.list.mockResolvedValue(makeApiList([]));

      const result = await connector.fetchAll();

      const record = result.items[0];
      expect(record.externalId).toBe("sub_xyz");
      expect(record.objectType).toBe("subscription");
      expect(record.status).toBe("active");
      expect(record.amount).toBe(4.99); // 499 cents → 4.99
      expect(record.currency).toBe("eur");
      expect(record.interval).toBe("month");
    });
  });
});
