// Server component — fetches analysis data from Supabase server-side.
// Auth check + RLS ensures users only see their own analyses.
// Replaces previous client-side fetch pattern with SSR for faster initial load.

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AnalysisPageClient from "./AnalysisPageClient";
import type { Analysis } from "@/lib/types";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Auth check — redirect to home if not logged in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  // Query analysis by ID — RLS ensures user can only see their own
  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, user_id, file_name, file_url, document_type, status, classification, analysis, investigation, advice, fairness_score, summary, created_at, completed_at"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  return <AnalysisPageClient analysis={data as Analysis} />;
}
