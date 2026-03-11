import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import * as fs from "fs";
import { resolve } from "path";

const LOG_DIR = resolve(process.cwd(), "company/autorun-logs");

interface StressTestRun {
  fileName: string;
  date: string;
  results: StressTestResult[];
}

interface StressTestResult {
  tier: string;
  contract: string;
  success: boolean;
  totalTimeMs: number;
  phases: Record<string, { status: string; timeMs: number }>;
  fairnessScore: number;
  scores: Record<string, number>;
  risksCount: number;
  actionsCount: number;
  needsLawyer: boolean;
  risksFound: string[];
  error?: string;
}

/**
 * GET /api/company/stress-test-results
 * Returns all stress test result files from company/autorun-logs/
 */
export async function GET(req: NextRequest) {
  // Auth: console operators only
  const authPayload = requireConsoleAuth(req);
  if (!authPayload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit
  const limited = await checkRateLimit(req, "console-stress-results");
  if (limited) return limited;

  try {
    if (!fs.existsSync(LOG_DIR)) {
      return NextResponse.json({ runs: [] });
    }

    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith("stress-test-") && f.endsWith(".json"))
      .sort()
      .reverse(); // newest first

    const runs: StressTestRun[] = [];

    for (const file of files.slice(0, 10)) { // max 10 runs
      try {
        const content = fs.readFileSync(resolve(LOG_DIR, file), "utf-8");
        const results = JSON.parse(content) as StressTestResult[];
        // Extract date from filename: stress-test-2026-03-08-09-48.json
        const dateMatch = file.match(/stress-test-(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})/);
        const date = dateMatch
          ? `${dateMatch[1]}T${dateMatch[2]}:${dateMatch[3]}:00Z`
          : new Date().toISOString();

        runs.push({ fileName: file, date, results });
      } catch {
        // skip malformed files
      }
    }

    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore lettura risultati" },
      { status: 500 }
    );
  }
}
