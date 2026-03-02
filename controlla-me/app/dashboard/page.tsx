// Server component wrapper — export const dynamic only works in server components
// since Next.js 16 Turbopack ignores route segment config in "use client" files.
// Dashboard loads user-specific data via Supabase browser client.

export const dynamic = "force-dynamic";

import DashboardClient from "./DashboardClient";

export default function Dashboard() {
  return <DashboardClient />;
}
