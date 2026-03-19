/**
 * Stripe Parser — Normalizes Stripe API objects into a flat StripeRecord format.
 *
 * Handles: Customer, Subscription, Invoice, PaymentIntent, Product, Price,
 * Charge, Refund, Dispute, Payout, BalanceTransaction, Coupon, CheckoutSession, PaymentMethod.
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
  /** Object type: customer | subscription | invoice | payment_intent | product | price | charge | refund | dispute | payout | balance_transaction | coupon | checkout_session | payment_method */
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseStripeObject(
  type: string,
  obj: any
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
    case "product":
      return parseProduct(obj as Stripe.Product);
    case "price":
      return parsePrice(obj as Stripe.Price);
    case "charge":
      return parseCharge(obj as Stripe.Charge);
    case "refund":
      return parseRefund(obj as Stripe.Refund);
    case "dispute":
      return parseDispute(obj as Stripe.Dispute);
    case "payout":
      return parsePayout(obj as Stripe.Payout);
    case "balance_transaction":
      return parseBalanceTransaction(obj as Stripe.BalanceTransaction);
    case "coupon":
      return parseCoupon(obj as Stripe.Coupon);
    case "checkout_session":
      return parseCheckoutSession(obj as Stripe.Checkout.Session);
    case "payment_method":
      return parsePaymentMethod(obj as Stripe.PaymentMethod);
    default:
      // Generic fallback for unknown types
      return {
        externalId: obj.id,
        objectType: type,
        status: null,
        email: null,
        name: null,
        amount: null,
        currency: null,
        createdAt: obj.created ? timestampToISO(obj.created) : new Date().toISOString(),
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

function parseProduct(p: Stripe.Product): StripeRecord {
  return {
    externalId: p.id,
    objectType: "product",
    status: p.active ? "active" : "inactive",
    email: null,
    name: p.name ?? null,
    amount: null,
    currency: null,
    createdAt: timestampToISO(p.created),
    updatedAt: timestampToISO(p.updated),
    customerId: null,
    subscriptionId: null,
    description: p.description ?? null,
    interval: null,
    stripeMetadata: (p.metadata as Record<string, string>) ?? {},
    rawExtra: {
      type: p.type,
      url: p.url,
      images: p.images,
      default_price: p.default_price,
      tax_code: p.tax_code,
      unit_label: p.unit_label,
    },
  };
}

function parsePrice(pr: Stripe.Price): StripeRecord {
  const productId = typeof pr.product === "string" ? pr.product : (pr.product as Stripe.Product)?.id ?? null;
  return {
    externalId: pr.id,
    objectType: "price",
    status: pr.active ? "active" : "inactive",
    email: null,
    name: pr.nickname ?? null,
    amount: pr.unit_amount != null ? centsToDecimal(pr.unit_amount) : null,
    currency: pr.currency ?? null,
    createdAt: timestampToISO(pr.created),
    updatedAt: null,
    customerId: null,
    subscriptionId: null,
    description: pr.nickname ?? null,
    interval: pr.recurring?.interval ?? null,
    stripeMetadata: (pr.metadata as Record<string, string>) ?? {},
    rawExtra: {
      product: productId,
      type: pr.type,
      billing_scheme: pr.billing_scheme,
      recurring_interval_count: pr.recurring?.interval_count,
      tax_behavior: pr.tax_behavior,
    },
  };
}

function parseCharge(c: Stripe.Charge): StripeRecord {
  return {
    externalId: c.id,
    objectType: "charge",
    status: c.status,
    email: c.receipt_email ?? null,
    name: c.billing_details?.name ?? null,
    amount: centsToDecimal(c.amount),
    currency: c.currency,
    createdAt: timestampToISO(c.created),
    updatedAt: null,
    customerId: resolveCustomerId(c.customer),
    subscriptionId: null,
    description: c.description ?? null,
    interval: null,
    stripeMetadata: (c.metadata as Record<string, string>) ?? {},
    rawExtra: {
      paid: c.paid,
      refunded: c.refunded,
      amount_refunded: centsToDecimal(c.amount_refunded),
      payment_method: c.payment_method,
      receipt_url: c.receipt_url,
      failure_code: c.failure_code,
      failure_message: c.failure_message,
      disputed: c.disputed,
    },
  };
}

function parseRefund(r: Stripe.Refund): StripeRecord {
  return {
    externalId: r.id,
    objectType: "refund",
    status: r.status ?? null,
    email: null,
    name: null,
    amount: centsToDecimal(r.amount),
    currency: r.currency,
    createdAt: timestampToISO(r.created),
    updatedAt: null,
    customerId: null,
    subscriptionId: null,
    description: r.reason ?? null,
    interval: null,
    stripeMetadata: (r.metadata as Record<string, string>) ?? {},
    rawExtra: {
      charge: r.charge,
      payment_intent: r.payment_intent,
      reason: r.reason,
      receipt_number: r.receipt_number,
    },
  };
}

function parseDispute(d: Stripe.Dispute): StripeRecord {
  return {
    externalId: d.id,
    objectType: "dispute",
    status: d.status,
    email: null,
    name: null,
    amount: centsToDecimal(d.amount),
    currency: d.currency,
    createdAt: timestampToISO(d.created),
    updatedAt: null,
    customerId: null,
    subscriptionId: null,
    description: d.reason ?? null,
    interval: null,
    stripeMetadata: (d.metadata as Record<string, string>) ?? {},
    rawExtra: {
      charge: d.charge,
      payment_intent: d.payment_intent,
      reason: d.reason,
      is_charge_refundable: d.is_charge_refundable,
      evidence_due_by: d.evidence_details?.due_by ? timestampToISO(d.evidence_details.due_by) : null,
    },
  };
}

function parsePayout(p: Stripe.Payout): StripeRecord {
  return {
    externalId: p.id,
    objectType: "payout",
    status: p.status,
    email: null,
    name: null,
    amount: centsToDecimal(p.amount),
    currency: p.currency,
    createdAt: timestampToISO(p.created),
    updatedAt: p.arrival_date ? timestampToISO(p.arrival_date) : null,
    customerId: null,
    subscriptionId: null,
    description: p.description ?? null,
    interval: null,
    stripeMetadata: (p.metadata as Record<string, string>) ?? {},
    rawExtra: {
      method: p.method,
      type: p.type,
      arrival_date: p.arrival_date ? timestampToISO(p.arrival_date) : null,
      destination: p.destination,
      failure_code: p.failure_code,
      failure_message: p.failure_message,
    },
  };
}

function parseBalanceTransaction(bt: Stripe.BalanceTransaction): StripeRecord {
  return {
    externalId: bt.id,
    objectType: "balance_transaction",
    status: bt.status,
    email: null,
    name: null,
    amount: centsToDecimal(bt.amount),
    currency: bt.currency,
    createdAt: timestampToISO(bt.created),
    updatedAt: bt.available_on ? timestampToISO(bt.available_on) : null,
    customerId: null,
    subscriptionId: null,
    description: bt.description ?? null,
    interval: null,
    stripeMetadata: {},
    rawExtra: {
      type: bt.type,
      net: centsToDecimal(bt.net),
      fee: centsToDecimal(bt.fee),
      source: bt.source,
      available_on: bt.available_on ? timestampToISO(bt.available_on) : null,
      reporting_category: bt.reporting_category,
    },
  };
}

function parseCoupon(c: Stripe.Coupon): StripeRecord {
  return {
    externalId: c.id,
    objectType: "coupon",
    status: c.valid ? "active" : "expired",
    email: null,
    name: c.name ?? null,
    amount: c.amount_off != null ? centsToDecimal(c.amount_off) : null,
    currency: c.currency ?? null,
    createdAt: timestampToISO(c.created),
    updatedAt: null,
    customerId: null,
    subscriptionId: null,
    description: c.name ?? (c.percent_off ? `${c.percent_off}% off` : null),
    interval: c.duration === "repeating" ? `${c.duration_in_months} months` : c.duration,
    stripeMetadata: (c.metadata as Record<string, string>) ?? {},
    rawExtra: {
      percent_off: c.percent_off,
      duration: c.duration,
      duration_in_months: c.duration_in_months,
      max_redemptions: c.max_redemptions,
      times_redeemed: c.times_redeemed,
      redeem_by: c.redeem_by ? timestampToISO(c.redeem_by) : null,
    },
  };
}

function parseCheckoutSession(s: Stripe.Checkout.Session): StripeRecord {
  return {
    externalId: s.id,
    objectType: "checkout_session",
    status: s.status ?? null,
    email: s.customer_email ?? null,
    name: null,
    amount: s.amount_total != null ? centsToDecimal(s.amount_total) : null,
    currency: s.currency ?? null,
    createdAt: timestampToISO(s.created),
    updatedAt: s.expires_at ? timestampToISO(s.expires_at) : null,
    customerId: typeof s.customer === "string" ? s.customer : null,
    subscriptionId: typeof s.subscription === "string" ? s.subscription : null,
    description: null,
    interval: null,
    stripeMetadata: (s.metadata as Record<string, string>) ?? {},
    rawExtra: {
      mode: s.mode,
      payment_status: s.payment_status,
      url: s.url,
      success_url: s.success_url,
      cancel_url: s.cancel_url,
      payment_intent: s.payment_intent,
    },
  };
}

function parsePaymentMethod(pm: Stripe.PaymentMethod): StripeRecord {
  return {
    externalId: pm.id,
    objectType: "payment_method",
    status: null,
    email: pm.billing_details?.email ?? null,
    name: pm.billing_details?.name ?? null,
    amount: null,
    currency: null,
    createdAt: timestampToISO(pm.created),
    updatedAt: null,
    customerId: typeof pm.customer === "string" ? pm.customer : null,
    subscriptionId: null,
    description: pm.type ?? null,
    interval: null,
    stripeMetadata: (pm.metadata as Record<string, string>) ?? {},
    rawExtra: {
      type: pm.type,
      card_brand: pm.card?.brand ?? null,
      card_last4: pm.card?.last4 ?? null,
      card_exp_month: pm.card?.exp_month ?? null,
      card_exp_year: pm.card?.exp_year ?? null,
      card_funding: pm.card?.funding ?? null,
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
