/**
 * GET /api/company/reports
 *
 * Elenca tutti i report disponibili nella directory company/
 * organizzati per categoria: daily-plans, state-of-company,
 * reports (dipartimentali), meetings, memos.
 *
 * Auth: requireConsoleAuth
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

const COMPANY_ROOT = path.resolve(process.cwd(), "company");

interface ReportItem {
  id: string;
  label: string;
  path: string;
  date?: string;
}

interface ReportGroup {
  id: string;
  label: string;
  emoji: string;
  items: ReportItem[];
}

function formatDate(dateStr: string): string {
  // Es. "2026-03-01" -> "1 marzo 2026"
  const months = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ];
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
}

function readDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function exists(p: string): boolean {
  return fs.existsSync(p);
}

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const groups: ReportGroup[] = [];

  // --- 1. Daily Plans ---
  const dailyDir = path.join(COMPANY_ROOT, "daily-plans");
  const dailyFiles = readDir(dailyDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  groups.push({
    id: "daily-plans",
    label: "Daily Plans",
    emoji: "📅",
    items: dailyFiles.map((f) => {
      const dateStr = f.replace(".md", "");
      return {
        id: dateStr,
        label: formatDate(dateStr),
        date: dateStr,
        path: `company/daily-plans/${f}`,
      };
    }),
  });

  // --- 2. State of Company ---
  const stateFiles = readDir(COMPANY_ROOT)
    .filter((f) => f.startsWith("state-of-company-") && f.endsWith(".md"))
    .sort()
    .reverse();

  groups.push({
    id: "state-of-company",
    label: "State of Company",
    emoji: "🏢",
    items: stateFiles.map((f) => {
      const dateStr = f.replace("state-of-company-", "").replace(".md", "");
      return {
        id: f,
        label: formatDate(dateStr),
        date: dateStr,
        path: `company/${f}`,
      };
    }),
  });

  // --- 3. Department Reports ---
  const reportsDir = path.join(COMPANY_ROOT, "reports");
  const reportDates = readDir(reportsDir)
    .filter((d) => fs.statSync(path.join(reportsDir, d)).isDirectory())
    .sort()
    .reverse();

  const deptReports: ReportItem[] = [];
  for (const date of reportDates) {
    const dateDir = path.join(reportsDir, date);
    const files = readDir(dateDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    for (const f of files) {
      const deptName = f.replace(/^\d+-/, "").replace(".md", "");
      const label = deptName === "master"
        ? `${formatDate(date)} — Master`
        : `${formatDate(date)} — ${deptName.charAt(0).toUpperCase() + deptName.slice(1)}`;
      deptReports.push({
        id: `${date}-${f}`,
        label,
        date,
        path: `company/reports/${date}/${f}`,
      });
    }
  }

  groups.push({
    id: "dept-reports",
    label: "Report Dipartimentali",
    emoji: "📊",
    items: deptReports,
  });

  // --- 4. Meetings ---
  const meetingsDir = path.join(COMPANY_ROOT, "meetings");
  const meetingFiles = readDir(meetingsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  groups.push({
    id: "meetings",
    label: "Meeting",
    emoji: "🤝",
    items: meetingFiles.map((f) => ({
      id: f,
      label: f.replace(".md", "").replace(/-/g, " "),
      path: `company/meetings/${f}`,
    })),
  });

  // --- 5. Memos ---
  const memosDir = path.join(COMPANY_ROOT, "memos");
  const memoFiles = readDir(memosDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .reverse();

  groups.push({
    id: "memos",
    label: "Memo",
    emoji: "📝",
    items: memoFiles.map((f) => ({
      id: f,
      label: f.replace(".md", "").replace(/-/g, " "),
      path: `company/memos/${f}`,
    })),
  });

  // --- 6. Sprints ---
  const sprintsDir = path.join(COMPANY_ROOT, "sprints");
  if (exists(sprintsDir)) {
    const sprintFiles = readDir(sprintsDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse();

    if (sprintFiles.length > 0) {
      groups.push({
        id: "sprints",
        label: "Sprint",
        emoji: "🚀",
        items: sprintFiles.map((f) => ({
          id: f,
          label: f.replace(".md", "").replace(/-/g, " "),
          path: `company/sprints/${f}`,
        })),
      });
    }
  }

  // Filtra categorie vuote
  const filtered = groups.filter((g) => g.items.length > 0);

  return NextResponse.json({ groups: filtered });
}
