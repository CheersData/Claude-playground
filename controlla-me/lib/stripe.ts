import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("Missing STRIPE_SECRET_KEY — Stripe features will be disabled");
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
      typescript: true,
    })
  : null;

export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    analysesPerMonth: 3,
    deepSearchLimit: 1,
  },
  pro: {
    name: "Pro",
    price: 4.99,
    analysesPerMonth: Infinity,
    deepSearchLimit: Infinity,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID,
  },
  single: {
    name: "Singola Analisi",
    price: 0.99,
    stripePriceId: process.env.STRIPE_SINGLE_PRICE_ID,
  },
} as const;
