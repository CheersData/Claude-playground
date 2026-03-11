/**
 * Stripe Connector — Sync business data (customers, subscriptions, invoices, payments)
 * through the data-connector pipeline.
 *
 * Uses the existing Stripe SDK (`stripe` package) with cursor-based pagination.
 * Designed for Stripe test mode (sk_test_ keys) as a demo connector.
 *
 * NOTE: The plugin-registry types are currently locked to ParsedArticle/LegalArticle.
 * This connector uses StripeRecord as its generic type. It can be used standalone
 * or registered once the registry supports generic data types (ADR-1).
 */

import Stripe from "stripe";
import { BaseConnector } from "./base";
import { parseStripeObject, type StripeRecord } from "../parsers/stripe-parser";
import type {
  ConnectResult,
  FetchResult,
  DataSource,
} from "../types";

/** Stripe object types we sync */
const SYNC_TYPES = ["customer", "subscription", "invoice", "payment_intent"] as const;
type SyncType = (typeof SYNC_TYPES)[number];

/** Max items per list() call (Stripe default max is 100) */
const PAGE_SIZE = 100;

export class StripeConnector extends BaseConnector<StripeRecord> {
  private client: Stripe | null = null;

  constructor(source: DataSource, log: (msg: string) => void = console.log) {
    super(source, log);
  }

  /**
   * Initialize Stripe client from env.
   * Uses STRIPE_SECRET_KEY (same key used by the app runtime).
   */
  private getClient(): Stripe {
    if (this.client) return this.client;

    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY non configurata. Impossibile connettersi a Stripe."
      );
    }

    this.client = new Stripe(key, {
      apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
      typescript: true,
    });

    return this.client;
  }

  /**
   * CONNECT phase: test API access and census available data.
   */
  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;

    try {
      const stripe = this.getClient();

      // 1. Test API access by fetching account info
      this.log(`[STRIPE] Testing API connection...`);
      const account = await stripe.accounts.retrieve();
      const isTestMode = account.id?.startsWith("acct_") || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_");
      this.log(`[STRIPE] Connected | account: ${account.id} | test mode: ${isTestMode}`);

      // 2. Census: count items per type
      const census: Record<string, number> = {};
      let totalEstimated = 0;

      for (const type of SYNC_TYPES) {
        const count = await this.countObjects(stripe, type);
        census[type] = count;
        totalEstimated += count;
        this.log(`[STRIPE] ${type}: ~${count} records`);
      }

      // 3. Fetch sample data (first 2 customers)
      const sampleData: StripeRecord[] = [];
      try {
        const customers = await stripe.customers.list({ limit: 2 });
        for (const c of customers.data) {
          sampleData.push(parseStripeObject("customer", c));
        }
      } catch (err) {
        this.log(`[STRIPE] Sample fetch warning: ${err instanceof Error ? err.message : String(err)}`);
      }

      return {
        sourceId,
        ok: true,
        message: `API OK | ${isTestMode ? "TEST" : "LIVE"} mode | ~${totalEstimated} total records`,
        census: {
          estimatedItems: totalEstimated,
          availableFormats: ["json"],
          sampleFields: [
            "externalId",
            "objectType",
            "status",
            "email",
            "amount",
            "currency",
            "createdAt",
            "metadata",
          ],
          sampleData: sampleData.length > 0 ? sampleData : undefined,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        sourceId,
        ok: false,
        message: `Stripe connection failed: ${msg}`,
        census: {
          estimatedItems: 0,
          availableFormats: [],
          sampleFields: [],
        },
      };
    }
  }

  /**
   * LOAD phase (full): fetch all Stripe objects across all sync types.
   */
  async fetchAll(
    options?: { limit?: number }
  ): Promise<FetchResult<StripeRecord>> {
    this.log(`[STRIPE] Full fetch starting...`);
    const stripe = this.getClient();
    const allRecords: StripeRecord[] = [];
    const globalLimit = options?.limit;

    for (const type of SYNC_TYPES) {
      if (globalLimit && allRecords.length >= globalLimit) break;

      const perTypeLimit = globalLimit
        ? globalLimit - allRecords.length
        : undefined;

      const records = await this.fetchObjectType(stripe, type, {
        limit: perTypeLimit,
      });
      allRecords.push(...records);
      this.log(`[STRIPE] ${type}: ${records.length} records fetched`);
    }

    this.log(`[STRIPE] Total: ${allRecords.length} records`);

    return {
      sourceId: this.source.id,
      items: allRecords,
      fetchedAt: new Date().toISOString(),
      metadata: {
        syncTypes: SYNC_TYPES,
        counts: Object.fromEntries(
          SYNC_TYPES.map((t) => [
            t,
            allRecords.filter((r) => r.objectType === t).length,
          ])
        ),
      },
    };
  }

  /**
   * LOAD phase (delta): fetch Stripe objects created/updated since a given date.
   */
  async fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<StripeRecord>> {
    this.log(`[STRIPE] Delta fetch since ${since}...`);
    const stripe = this.getClient();
    const sinceTimestamp = Math.floor(new Date(since).getTime() / 1000);
    const allRecords: StripeRecord[] = [];
    const globalLimit = options?.limit;

    for (const type of SYNC_TYPES) {
      if (globalLimit && allRecords.length >= globalLimit) break;

      const perTypeLimit = globalLimit
        ? globalLimit - allRecords.length
        : undefined;

      const records = await this.fetchObjectType(stripe, type, {
        limit: perTypeLimit,
        createdAfter: sinceTimestamp,
      });
      allRecords.push(...records);
      this.log(`[STRIPE] ${type} (delta): ${records.length} records`);
    }

    this.log(`[STRIPE] Delta total: ${allRecords.length} records`);

    return {
      sourceId: this.source.id,
      items: allRecords,
      fetchedAt: new Date().toISOString(),
      metadata: {
        since,
        sinceTimestamp,
        syncTypes: SYNC_TYPES,
      },
    };
  }

  // ─── Internal methods ───

  /**
   * Count objects of a given type (approximate, using list with limit 1).
   * Stripe doesn't provide a count endpoint, so we estimate.
   */
  private async countObjects(
    stripe: Stripe,
    type: SyncType
  ): Promise<number> {
    try {
      // Fetch with limit 1 to see if has_more is true
      // This gives us at least "1" or "0", and has_more tells us there are more.
      // For a real count we'd need to paginate through all, which is expensive.
      // This is a demo connector — we'll return an estimate.
      switch (type) {
        case "customer": {
          const result = await stripe.customers.list({ limit: 1 });
          return result.has_more ? 100 : result.data.length; // rough estimate
        }
        case "subscription": {
          const result = await stripe.subscriptions.list({ limit: 1 });
          return result.has_more ? 50 : result.data.length;
        }
        case "invoice": {
          const result = await stripe.invoices.list({ limit: 1 });
          return result.has_more ? 200 : result.data.length;
        }
        case "payment_intent": {
          const result = await stripe.paymentIntents.list({ limit: 1 });
          return result.has_more ? 150 : result.data.length;
        }
        default:
          return 0;
      }
    } catch {
      return 0;
    }
  }

  /**
   * Fetch all objects of a given type with cursor-based pagination.
   * Handles Stripe's `has_more` + `starting_after` pattern.
   */
  private async fetchObjectType(
    stripe: Stripe,
    type: SyncType,
    options?: { limit?: number; createdAfter?: number }
  ): Promise<StripeRecord[]> {
    const records: StripeRecord[] = [];
    let startingAfter: string | undefined;
    const maxItems = options?.limit ?? Infinity;
    const createdFilter = options?.createdAfter
      ? { gte: options.createdAfter }
      : undefined;

    while (true) {
      if (records.length >= maxItems) break;

      const pageSize = Math.min(PAGE_SIZE, maxItems - records.length);

      try {
        const page = await this.listPage(stripe, type, {
          limit: pageSize,
          starting_after: startingAfter,
          created: createdFilter,
        });

        for (const obj of page.data) {
          records.push(parseStripeObject(type, obj));
        }

        if (!page.has_more || page.data.length === 0) break;

        // Cursor for next page: use the last item's id
        startingAfter = page.data[page.data.length - 1].id;

        // Rate limit pause between pages
        await this.rateLimitPause();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[STRIPE] Error fetching ${type} page: ${msg}`);
        break;
      }
    }

    return records;
  }

  /**
   * List a single page of Stripe objects by type.
   */
  private async listPage(
    stripe: Stripe,
    type: SyncType,
    params: {
      limit: number;
      starting_after?: string;
      created?: { gte: number };
    }
  ): Promise<Stripe.ApiList<Stripe.Customer | Stripe.Subscription | Stripe.Invoice | Stripe.PaymentIntent>> {
    const listParams: Stripe.CustomerListParams = {
      limit: params.limit,
      ...(params.starting_after ? { starting_after: params.starting_after } : {}),
      ...(params.created ? { created: params.created } : {}),
    };

    switch (type) {
      case "customer":
        return stripe.customers.list(listParams);
      case "subscription":
        return stripe.subscriptions.list(listParams as Stripe.SubscriptionListParams);
      case "invoice":
        return stripe.invoices.list(listParams as Stripe.InvoiceListParams);
      case "payment_intent":
        return stripe.paymentIntents.list(listParams as Stripe.PaymentIntentListParams);
      default:
        throw new Error(`Unknown Stripe object type: ${type}`);
    }
  }

  /**
   * Override rate limit pause for Stripe (25 req/s in test mode, be conservative).
   */
  protected override async rateLimitPause(): Promise<void> {
    await this.sleep(200); // 5 req/s — conservative for test mode
  }
}
