/**
 * Stripe Parser — Normalizes Stripe API objects into a flat StripeRecord format.
 *
 * Handles: Customer, Subscription, Invoice, PaymentIntent.
 * Extracts key fields: id, type, status, amounts, dates, metadata.
 * Amounts are normalized to decimal (Stripe uses cents).
 *
 * Compatible with Stripe SDK v20.x (2025-01-27.acacia API version).
 */

import type Stripe from "stripe";

// ─── Output type ───

export interface StripeRecord {
  /** Stripe object ID (e.g. cus_xxx, sub_xxx, in_xxx, pi_xxx) */
  externalId: string;
  /** Object type: customer | subscription | invoice | payment_intent */
  objectType: string;
  /** Object status (active, trialing, paid, succeeded, etc.) */
  status: string | null;
  /** Customer email (when available) */
  email: string | null;
  /** Customer name (when available) */
  name: string | null;
  /** Amount in decimal (converted from Stripe cents). Null for customers. */
  amount: number | null;
  /** ISO 4217 currency code (lowercase). Null for customers. */
  currency: string | null;
  /** ISO 8601 creation date */
  createdAt: string;
  /** ISO 8601 date of last update (or period end, depending on object type) */
  updatedAt: string | null;
  /** Stripe customer ID (for linking subscriptions/invoices/payments to customers) */
  customerId: string | null;
  /** Stripe subscription ID (for invoices linked to subscriptions) */
  subscriptionId: string | null;
  /** Plan/product description (for subscriptions) */
  description: string | null;
  /** Billing interval: month | year (for subscriptions) */
  interval: string | null;
  /** Original Stripe metadata object */
  stripeMetadata: Record<string, string>;
  /** Raw fields not covered by the normalized schema */
  rawExtra: Record<string, unknown>;
}

// ─── Parser ───

/**
 * Parse any Stripe API object into a normalized StripeRecord.
 */
export function parseStripeObject(
  type: string,
  obj: Stripe.Customer | Stripe.Subscription | Stripe.Invoice | Stripe.PaymentIntent
): StripeRecord {
  switch (type) {
    case "customer":
      return parseCustomer(obj as Stripe.Customer);
    case "subscription":
      return parseSubscription(obj as Stripe.Subscription);
    case "invoice":
      return parseInvoice(obj as Stripe.Invoice);
    case "payment_intent":
      return parsePaymentIntent(obj as Stripe.PaymentIntent);
    default:
      // Generic fallback
      return {
        externalId: obj.id,
        objectType: type,
        status: null,
        email: null,
        name: null,
        amount: null,
        currency: null,
        createdAt: timestampToISO(obj.created),
        updatedAt: null,
        customerId: null,
        subscriptionId: null,
        description: null,
        interval: null,
        stripeMetadata: (obj.metadata as Record<string, string>) ?? {},
        rawExtra: {},
      };
  }
}

// ─── Per-type parsers ───

function parseCustomer(c: Stripe.Customer): StripeRecord {
  // In Stripe v20, Customer.deleted is typed as `void` (always non-deleted).
  // DeletedCustomer is a separate type with deleted: true.
  // Since we only list non-deleted customers, status is always "active".
  return {
    externalId: c.id,
    objectType: "customer",
    status: "active",
    email: c.email ?? null,
    name: c.name ?? null,
    amount: null,
    currency: c.currency ?? null,
    createdAt: timestampToISO(c.created),
    updatedAt: null,
    customerId: c.id,
    subscriptionId: null,
    description: c.description ?? null,
    interval: null,
    stripeMetadata: (c.metadata as Record<string, string>) ?? {},
    rawExtra: {
      phone: c.phone,
      delinquent: c.delinquent,
      balance: centsToDecimal(c.balance),
      default_source: c.default_source,
    },
  };
}

function parseSubscription(s: Stripe.Subscription): StripeRecord {
  // Extract plan info from the first item
  const firstItem = s.items?.data?.[0];
  const plan = firstItem?.plan;

  // In Stripe v20, current_period_start/end are on SubscriptionItem, not Subscription.
  // We extract them from the first item if available.
  const periodEnd = firstItem?.current_period_end ?? null;
  const periodStart = firstItem?.current_period_start ?? null;

  return {
    externalId: s.id,
    objectType: "subscription",
    status: s.status,
    email: null,
    name: null,
    amount: plan?.amount ? centsToDecimal(plan.amount) : null,
    currency: plan?.currency ?? s.currency ?? null,
    createdAt: timestampToISO(s.created),
    updatedAt: periodEnd ? timestampToISO(periodEnd) : null,
    customerId: resolveCustomerId(s.customer),
    subscriptionId: s.id,
    description: s.description ?? plan?.nickname ?? null,
    interval: plan?.interval ?? null,
    stripeMetadata: (s.metadata as Record<string, string>) ?? {},
    rawExtra: {
      cancel_at_period_end: s.cancel_at_period_end,
      trial_start: s.trial_start ? timestampToISO(s.trial_start) : null,
      trial_end: s.trial_end ? timestampToISO(s.trial_end) : null,
      current_period_start: periodStart ? timestampToISO(periodStart) : null,
      current_period_end: periodEnd ? timestampToISO(periodEnd) : null,
    },
  };
}

function parseInvoice(inv: Stripe.Invoice): StripeRecord {
  // In Stripe v20, subscription is accessed via inv.parent?.subscription_details?.subscription
  // instead of a direct inv.subscription field.
  const subscriptionRef = inv.parent?.subscription_details?.subscription ?? null;
  const subscriptionId = resolveStringId(subscriptionRef);

  return {
    externalId: inv.id ?? `inv_unknown_${Date.now()}`,
    objectType: "invoice",
    status: inv.status ?? null,
    email: inv.customer_email ?? null,
    name: inv.customer_name ?? null,
    amount: inv.amount_due != null ? centsToDecimal(inv.amount_due) : null,
    currency: inv.currency ?? null,
    createdAt: timestampToISO(inv.created),
    updatedAt: inv.status_transitions?.paid_at
      ? timestampToISO(inv.status_transitions.paid_at)
      : null,
    customerId: resolveCustomerId(inv.customer),
    subscriptionId,
    description: inv.description ?? `Invoice ${inv.number ?? inv.id}`,
    interval: null,
    stripeMetadata: (inv.metadata as Record<string, string>) ?? {},
    rawExtra: {
      number: inv.number,
      amount_paid: inv.amount_paid != null ? centsToDecimal(inv.amount_paid) : null,
      amount_remaining: inv.amount_remaining != null ? centsToDecimal(inv.amount_remaining) : null,
      attempted: inv.attempted,
      // In v20, paid status is derived from status === "paid"
      paid: inv.status === "paid",
      hosted_invoice_url: inv.hosted_invoice_url,
      period_start: inv.period_start ? timestampToISO(inv.period_start) : null,
      period_end: inv.period_end ? timestampToISO(inv.period_end) : null,
    },
  };
}

function parsePaymentIntent(pi: Stripe.PaymentIntent): StripeRecord {
  return {
    externalId: pi.id,
    objectType: "payment_intent",
    status: pi.status,
    email: pi.receipt_email ?? null,
    name: null,
    amount: centsToDecimal(pi.amount),
    currency: pi.currency,
    createdAt: timestampToISO(pi.created),
    updatedAt: null,
    customerId: resolveCustomerId(pi.customer),
    subscriptionId: null,
    description: pi.description ?? null,
    interval: null,
    stripeMetadata: (pi.metadata as Record<string, string>) ?? {},
    rawExtra: {
      amount_received: centsToDecimal(pi.amount_received ?? 0),
      payment_method: pi.payment_method,
      payment_method_types: pi.payment_method_types,
      cancellation_reason: pi.cancellation_reason,
      latest_charge: pi.latest_charge,
    },
  };
}

// ─── Utilities ───

/** Convert Stripe Unix timestamp to ISO 8601 string */
function timestampToISO(ts: number): string {
  return new Date(ts * 1000).toISOString();
}

/** Convert Stripe cents to decimal (e.g. 4999 → 49.99) */
function centsToDecimal(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Resolve Stripe expandable customer field to a string ID.
 * Stripe's customer field can be a string ID or an expanded Customer object.
 */
function resolveCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return customer.id ?? null;
}

/**
 * Resolve Stripe expandable field to a string ID.
 */
function resolveStringId(
  field: string | { id: string } | null | undefined
): string | null {
  if (!field) return null;
  if (typeof field === "string") return field;
  return field.id ?? null;
}
