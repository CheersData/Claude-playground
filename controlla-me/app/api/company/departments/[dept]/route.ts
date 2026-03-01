/**
 * GET /api/company/departments/[dept]
 *
 * Restituisce tutti i dati necessari al DepartmentDetailPanel:
 * - meta: metadati statici (missione, agenti, runbook, KPI)
 * - departmentMd: contenuto del file company/{dept}/department.md
 * - activeTasks: task open/in_progress/blocked/review
 * - doneTasks: ultime 10 task completate
 * - analysis: ultima analisi AI dal daily standup (o null)
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { getOpenTasks } from "@/lib/company/tasks";
import { getLatestDepartmentAnalysis } from "@/lib/company/department-analyses";
import { getDepartmentMeta } from "@/lib/company/departments";
import type { Department } from "@/lib/company/types";
import { requireConsoleAuth } from "@/lib/middleware/console-token";

const ACTIVE_STATUSES = new Set(["open", "in_progress", "blocked", "review"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dept: string }> }
) {
  const payload = requireConsoleAuth(_req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { dept } = await params;
    const department = dept as Department;

    const meta = getDepartmentMeta(department);
    if (!meta) {
      return NextResponse.json({ error: "Dipartimento non trovato" }, { status: 404 });
    }

    // Fetch in parallelo: tutti i task del dipartimento + analisi
    const [allTasks, analysis] = await Promise.all([
      getOpenTasks({ department, limit: 100 }),
      getLatestDepartmentAnalysis(department),
    ]);

    const activeTasks = allTasks.filter((t) => ACTIVE_STATUSES.has(t.status));
    const doneTasks = allTasks
      .filter((t) => t.status === "done")
      .sort((a, b) => {
        const aT = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bT = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bT - aT;
      })
      .slice(0, 10);

    // Leggi department.md dal filesystem (server-side, non esposto come download)
    let departmentMd: string | null = null;
    try {
      const mdPath = path.resolve(process.cwd(), meta.departmentFilePath);
      if (fs.existsSync(mdPath)) {
        departmentMd = fs.readFileSync(mdPath, "utf-8");
      }
    } catch {
      // Non fatale: il panel usa la mission dal registry statico
    }

    return NextResponse.json({
      meta,
      departmentMd,
      activeTasks,
      doneTasks,
      analysis,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
