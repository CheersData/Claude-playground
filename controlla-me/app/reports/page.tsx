// Server component wrapper — export const dynamic only works in server components
// since Next.js 16 Turbopack ignores route segment config in "use client" files.
// Reports page reads auth headers from client storage.

export const dynamic = "force-dynamic";

import ReportsPageClient from "./ReportsPageClient";

export default function ReportsPage() {
  return <ReportsPageClient />;
}
