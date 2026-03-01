/**
 * Department Analyses — CRUD per le analisi AI dei dipartimenti.
 * Pattern identico a lib/company/tasks.ts.
 *
 * Le analisi vengono generate da scripts/daily-standup.ts via `claude -p` CLI
 * e consumate da GET /api/company/departments/[dept].
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { Department } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnalysisStatusLabel = "on-track" | "at-risk" | "idle" | "blocked";

export interface DepartmentAnalysis {
  id: string;
  department: Department;
  date: string;                    // "YYYY-MM-DD"
  summary: string;
  statusLabel: AnalysisStatusLabel;
  keyPoints: string[];
  openCount: number;
  inProgressCount: number;
  blockedCount: number;
  doneTodayCount: number;
  generatedAt: string;
}

export interface UpsertAnalysisInput {
  department: Department;
  date: string;                    // "YYYY-MM-DD"
  summary: string;
  statusLabel: AnalysisStatusLabel;
  keyPoints?: string[];
  openCount?: number;
  inProgressCount?: number;
  blockedCount?: number;
  doneTodayCount?: number;
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

export async function upsertDepartmentAnalysis(
  input: UpsertAnalysisInput
): Promise<DepartmentAnalysis> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("department_analyses")
    .upsert(
      {
        department: input.department,
        date: input.date,
        summary: input.summary,
        status_label: input.statusLabel,
        key_points: input.keyPoints ?? [],
        open_count: input.openCount ?? 0,
        in_progress_count: input.inProgressCount ?? 0,
        blocked_count: input.blockedCount ?? 0,
        done_today_count: input.doneTodayCount ?? 0,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "department,date" }
    )
    .select("*")
    .single();

  if (error || !data)
    throw new Error(`[DEPT-ANALYSIS] Errore upsert: ${error?.message}`);
  return mapRow(data);
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getLatestDepartmentAnalysis(
  department: Department
): Promise<DepartmentAnalysis | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("department_analyses")
    .select("*")
    .eq("department", department)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

// ─── Row Mapper ───────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): DepartmentAnalysis {
  return {
    id: row.id as string,
    department: row.department as Department,
    date: row.date as string,
    summary: row.summary as string,
    statusLabel: row.status_label as AnalysisStatusLabel,
    keyPoints: (row.key_points as string[]) ?? [],
    openCount: (row.open_count as number) ?? 0,
    inProgressCount: (row.in_progress_count as number) ?? 0,
    blockedCount: (row.blocked_count as number) ?? 0,
    doneTodayCount: (row.done_today_count as number) ?? 0,
    generatedAt: row.generated_at as string,
  };
}
