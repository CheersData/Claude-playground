/**
 * dept-context.ts — Fast context retrieval for department leaders.
 *
 * Generates concise context summaries for each department so leaders
 * can quickly understand their domain without re-reading all code.
 *
 * Usage:
 *   npx tsx scripts/dept-context.ts <dept>          # Show context for a department
 *   npx tsx scripts/dept-context.ts --all            # Generate all department contexts
 *   npx tsx scripts/dept-context.ts --list           # List available departments
 *
 * The context includes:
 *   1. Department identity (from department.md)
 *   2. Active agents (from agents/*.md)
 *   3. Available runbooks (from runbooks/*.md)
 *   4. Current tasks (from task board)
 *   5. Key files owned by this department
 *   6. Recent decisions affecting this department
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { execSync } from "child_process";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const COMPANY_DIR = path.resolve(__dirname, "../company");
const ROOT = path.resolve(__dirname, "..");

// Map departments to their key code files
const DEPT_KEY_FILES: Record<string, string[]> = {
  "ufficio-legale": [
    "lib/agents/orchestrator.ts",
    "lib/agents/classifier.ts",
    "lib/agents/analyzer.ts",
    "lib/agents/investigator.ts",
    "lib/agents/advisor.ts",
    "lib/agents/corpus-agent.ts",
    "lib/prompts/*.ts",
  ],
  trading: [
    "trading/src/analysis.py",
    "trading/src/pipeline.py",
    "trading/src/scheduler.py",
    "trading/src/agents/*.py",
    "trading/src/config/settings.py",
  ],
  architecture: [
    "lib/ai-sdk/agent-runner.ts",
    "lib/ai-sdk/generate.ts",
    "lib/tiers.ts",
    "lib/models.ts",
    "next.config.ts",
  ],
  "data-engineering": [
    "lib/staff/data-connector/**/*.ts",
    "scripts/data-connector.ts",
    "scripts/corpus-sources.ts",
    "lib/legal-corpus.ts",
    "lib/embeddings.ts",
  ],
  "quality-assurance": [
    "tests/**/*.test.ts",
    "e2e/**/*.spec.ts",
    "vitest.config.ts",
    "playwright.config.ts",
  ],
  security: [
    "lib/middleware/*.ts",
    "app/api/auth/**/*.ts",
  ],
  finance: [
    "lib/company/cost-tracking.ts",
    "app/api/company/costs/route.ts",
  ],
  operations: [
    "scripts/company-scheduler-daemon.ts",
    "scripts/daily-standup.ts",
    "app/api/console/**/*.ts",
  ],
  strategy: [
    "company/strategy/Q1-2026-review.md",
  ],
  marketing: [
    "company/marketing/runbooks/*.md",
  ],
  protocols: [
    "company/protocols/decision-trees/*.yaml",
    "company/protocols/runbooks/*.md",
    "company/contracts.md",
    "company/process-designer.md",
  ],
  "ux-ui": [
    "components/**/*.tsx",
    "app/globals.css",
    "docs/BEAUTY-REPORT.md",
  ],
};

interface DeptContext {
  name: string;
  identity: string;
  agents: { name: string; role: string }[];
  runbooks: string[];
  keyFiles: string[];
  openTasks: { title: string; priority: string; status: string }[];
  recentDone: { title: string; summary: string }[];
}

function readFileSafe(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function extractFirstSection(md: string): string {
  // Extract mission/role section (first 500 chars after ## Missione or ## Ruolo)
  const lines = md.split("\n");
  let capturing = false;
  const result: string[] = [];

  for (const line of lines) {
    if (line.match(/^##\s+(Missione|Ruolo|Chi sei|Tipo)/i)) {
      capturing = true;
      continue;
    }
    if (capturing && line.startsWith("## ")) break;
    if (capturing) result.push(line);
  }

  return result.join("\n").trim().slice(0, 500);
}

function getAgents(deptDir: string): { name: string; role: string }[] {
  const agentsDir = path.join(deptDir, "agents");
  if (!fs.existsSync(agentsDir)) return [];

  return fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const content = readFileSafe(path.join(agentsDir, f));
      const name = f.replace(".md", "");
      // Extract first line of ## Ruolo
      const roleMatch = content.match(/##\s+Ruolo\s*\n+([^\n]+)/);
      const role = roleMatch ? roleMatch[1].trim().slice(0, 100) : "—";
      return { name, role };
    });
}

function getRunbooks(deptDir: string): string[] {
  const runbooksDir = path.join(deptDir, "runbooks");
  if (!fs.existsSync(runbooksDir)) return [];

  return fs
    .readdirSync(runbooksDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(".md", ""));
}

interface TaskSummary {
  title: string;
  priority: string;
  status: string;
}

function getTasksForDept(dept: string): { open: TaskSummary[]; recentDone: TaskSummary[] } {
  try {
    const raw = execSync(
      `npx tsx scripts/company-tasks.ts list --dept ${dept} --status open`,
      { encoding: "utf-8", cwd: ROOT, timeout: 10000 }
    );
    const openTasks = raw
      .split("\n")
      .filter((l: string) => l.includes("[open]") || l.includes("[in_progress]"))
      .map((l: string) => {
        const titleMatch = l.match(/\|\s*(.+?)\s*$/);
        const priorityMatch = l.match(/(CRITICAL|HIGH|MEDIUM|LOW)/i);
        const statusMatch = l.match(/\[(open|in_progress)\]/);
        return {
          title: titleMatch?.[1]?.trim() ?? l.trim(),
          priority: priorityMatch?.[1] ?? "medium",
          status: statusMatch?.[1] ?? "open",
        };
      });

    return { open: openTasks, recentDone: [] };
  } catch {
    return { open: [], recentDone: [] };
  }
}

function buildContext(dept: string): DeptContext {
  const deptDir = path.join(COMPANY_DIR, dept);
  const deptMd = readFileSafe(path.join(deptDir, "department.md"));

  return {
    name: dept,
    identity: extractFirstSection(deptMd) || `Dipartimento: ${dept}`,
    agents: getAgents(deptDir),
    runbooks: getRunbooks(deptDir),
    keyFiles: DEPT_KEY_FILES[dept] ?? [],
    openTasks: getTasksForDept(dept).open,
    recentDone: [],
  };
}

function formatContext(ctx: DeptContext): string {
  const lines = [
    `# Context: ${ctx.name}`,
    "",
    `## Identity`,
    ctx.identity,
    "",
  ];

  if (ctx.agents.length > 0) {
    lines.push("## Agents");
    for (const a of ctx.agents) {
      lines.push(`- **${a.name}**: ${a.role}`);
    }
    lines.push("");
  }

  if (ctx.runbooks.length > 0) {
    lines.push("## Runbooks");
    for (const r of ctx.runbooks) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  if (ctx.keyFiles.length > 0) {
    lines.push("## Key Files");
    for (const f of ctx.keyFiles) {
      lines.push(`- \`${f}\``);
    }
    lines.push("");
  }

  if (ctx.openTasks.length > 0) {
    lines.push("## Open Tasks");
    for (const t of ctx.openTasks) {
      lines.push(`- [${t.priority}] ${t.title}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--list")) {
  const depts = fs
    .readdirSync(COMPANY_DIR)
    .filter((d) =>
      fs.existsSync(path.join(COMPANY_DIR, d, "department.md"))
    );
  console.log("Available departments:");
  for (const d of depts) {
    console.log(`  - ${d}`);
  }
} else if (args.includes("--all")) {
  const depts = fs
    .readdirSync(COMPANY_DIR)
    .filter((d) =>
      fs.existsSync(path.join(COMPANY_DIR, d, "department.md"))
    );
  for (const d of depts) {
    const ctx = buildContext(d);
    console.log(formatContext(ctx));
    console.log("---\n");
  }
} else if (args[0]) {
  const dept = args[0];
  const deptDir = path.join(COMPANY_DIR, dept);
  if (!fs.existsSync(path.join(deptDir, "department.md"))) {
    console.error(`Department not found: ${dept}`);
    console.error("Use --list to see available departments.");
    process.exit(1);
  }
  const ctx = buildContext(dept);
  console.log(formatContext(ctx));
} else {
  console.log("Usage:");
  console.log("  npx tsx scripts/dept-context.ts <dept>   # Show context for a department");
  console.log("  npx tsx scripts/dept-context.ts --all     # Generate all department contexts");
  console.log("  npx tsx scripts/dept-context.ts --list    # List available departments");
}
