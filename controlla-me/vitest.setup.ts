import { vi } from "vitest";

// Provide deterministic env vars so modules that read process.env at import time don't crash
process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_fake";
process.env.STRIPE_PRO_PRICE_ID = "price_test_pro";
process.env.STRIPE_SINGLE_PRICE_ID = "price_test_single";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

// Suppress console.log/warn during tests (agents log extensively)
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
