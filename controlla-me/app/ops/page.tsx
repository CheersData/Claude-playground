// Server component wrapper — export const dynamic only works in server components
// since Next.js 16 Turbopack ignores route segment config in "use client" files.
// Ops page directly accesses sessionStorage for auth tokens on mount.

export const dynamic = "force-dynamic";

import OpsPageClient from "./OpsPageClient";

export default function OpsPage() {
  return <OpsPageClient />;
}
