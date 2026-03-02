// Server component wrapper — export const dynamic only works in server components
// since Next.js 16 Turbopack ignores route segment config in "use client" files.
// Analysis page is a dynamic route with user-specific data via Supabase.

export const dynamic = "force-dynamic";

import AnalysisPageClient from "./AnalysisPageClient";

export default function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <AnalysisPageClient params={params} />;
}
