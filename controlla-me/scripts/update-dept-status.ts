/**
 * update-dept-status.ts — Aggiorna o visualizza lo status.json di un dipartimento.
 *
 * Usage:
 *   npx tsx scripts/update-dept-status.ts --view <dept>           # Visualizza status corrente
 *   npx tsx scripts/update-dept-status.ts --view --all            # Visualizza tutti gli status
 *   npx tsx scripts/update-dept-status.ts <dept> --set key=value  # Aggiorna un campo
 *   npx tsx scripts/update-dept-status.ts <dept> --patch <json>   # Merge JSON nel top-level
 *   npx tsx scripts/update-dept-status.ts --list                  # Lista dipartimenti con status
 *
 * Esempi:
 *   npx tsx scripts/update-dept-status.ts trading --set health=warning
 *   npx tsx scripts/update-dept-status.ts trading --patch '{"runtime":{"kill_switch_active":true}}'
 *   npx tsx scripts/update-dept-status.ts trading --set "summary=Kill switch attivato: -2.1% daily"
 *   npx tsx scripts/update-dept-status.ts --view trading
 *   npx tsx scripts/update-dept-status.ts --view --all
 */

import * as fs from "fs";
import * as path from "path";

const COMPANY_DIR = path.resolve(__dirname, "../company");
const SCHEMA_VERSION = "1.0";

// Dipartimenti con status.json
const SUPPORTED_DEPTS = [
  "trading",
  "quality-assurance",
  "data-engineering",
  "architecture",
  "security",
  "finance",
  "operations",
  "strategy",
  "marketing",
  "protocols",
  "ux-ui",
  "ufficio-legale",
  "acceleration",
];

function getStatusPath(dept: string): string {
  return path.join(COMPANY_DIR, dept, "status.json");
}

function readStatus(dept: string): Record<string, unknown> | null {
  const filePath = getStatusPath(dept);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeStatus(dept: string, data: Record<string, unknown>): void {
  const filePath = getStatusPath(dept);
  // Update _meta
  const meta = (data["_meta"] as Record<string, unknown>) || {};
  meta["last_updated"] = new Date().toISOString();
  meta["dept"] = dept;
  meta["schema_version"] = SCHEMA_VERSION;
  data["_meta"] = meta;

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function setNestedKey(obj: Record<string, unknown>, keyPath: string, value: unknown): void {
  const parts = keyPath.split(".");
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cursor[parts[i]] == null || typeof cursor[parts[i]] !== "object") {
      cursor[parts[i]] = {};
    }
    cursor = cursor[parts[i]] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === "object" &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>
      );
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function healthEmoji(health: string): string {
  switch (health) {
    case "ok": return "🟢";
    case "warning": return "🟡";
    case "critical": return "🔴";
    case "unknown": return "⚪";
    default: return "⚪";
  }
}

function viewStatus(dept: string): void {
  const status = readStatus(dept);
  if (!status) {
    console.log(`  ⚪ ${dept}: nessun status.json trovato`);
    return;
  }

  const health = (status["health"] as string) || "unknown";
  const summary = (status["summary"] as string) || "(nessun summary)";
  const meta = (status["_meta"] as Record<string, unknown>) || {};
  const lastUpdated = (meta["last_updated"] as string) || "?";

  console.log(`\n${healthEmoji(health)} [${dept}] — ${health.toUpperCase()}`);
  console.log(`  Summary: ${summary}`);
  console.log(`  Ultimo aggiornamento: ${lastUpdated}`);

  // Gaps se presenti
  const gaps = status["gaps"] as Array<{ id: string; description: string; severity: string }> | undefined;
  if (gaps && gaps.length > 0) {
    const critical = gaps.filter((g) => g.severity === "critical");
    if (critical.length > 0) {
      console.log(`  ⚠ Gap critici (${critical.length}):`);
      critical.forEach((g) => console.log(`    [${g.id}] ${g.description}`));
    }
  }

  // Open tasks se presenti
  const openTasks = status["open_tasks"] as unknown[] | undefined;
  if (openTasks && openTasks.length > 0) {
    console.log(`  📋 Task aperti: ${openTasks.length}`);
  }

  // Blockers
  const blockers = status["blockers"] as unknown[] | undefined;
  if (blockers && blockers.length > 0) {
    console.log(`  🚫 Blockers: ${blockers.length}`);
  }
}

function listDepts(): void {
  console.log("\nDipartimenti con status.json:");
  for (const dept of SUPPORTED_DEPTS) {
    const filePath = getStatusPath(dept);
    if (fs.existsSync(filePath)) {
      const status = readStatus(dept);
      const health = (status?.["health"] as string) || "unknown";
      const summary = (status?.["summary"] as string) || "";
      const shortSummary = summary.length > 60 ? summary.slice(0, 57) + "..." : summary;
      console.log(`  ${healthEmoji(health)} ${dept.padEnd(20)} ${shortSummary}`);
    } else {
      console.log(`  ⚪ ${dept.padEnd(20)} (nessun status.json)`);
    }
  }
}

// ─── CLI ───

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
update-dept-status.ts — Gestisce status.json dei dipartimenti

Usage:
  npx tsx scripts/update-dept-status.ts --list                    # Lista dipartimenti
  npx tsx scripts/update-dept-status.ts --view <dept>             # Visualizza status
  npx tsx scripts/update-dept-status.ts --view --all              # Visualizza tutti
  npx tsx scripts/update-dept-status.ts <dept> --set key=value    # Imposta campo (dot-notation)
  npx tsx scripts/update-dept-status.ts <dept> --patch '<json>'   # Merge JSON

Esempi:
  npx tsx scripts/update-dept-status.ts trading --set health=warning
  npx tsx scripts/update-dept-status.ts trading --set "runtime.kill_switch_active=true"
  npx tsx scripts/update-dept-status.ts trading --patch '{"runtime":{"last_pipeline_run":"2026-03-03T10:00:00Z"}}'
  npx tsx scripts/update-dept-status.ts --view trading
  npx tsx scripts/update-dept-status.ts --view --all
`);
  process.exit(0);
}

// --list
if (args[0] === "--list") {
  listDepts();
  process.exit(0);
}

// --view
if (args[0] === "--view") {
  const target = args[1];
  if (!target || target === "--all") {
    console.log("\n═══════════════════════════════════════════════");
    console.log("  STATO DIPARTIMENTI");
    console.log("═══════════════════════════════════════════════");
    for (const dept of SUPPORTED_DEPTS) {
      viewStatus(dept);
    }
  } else {
    viewStatus(target);
  }
  process.exit(0);
}

// <dept> --set key=value OR <dept> --patch <json>
const dept = args[0];
if (!dept || dept.startsWith("--")) {
  console.error("Errore: specifica un dipartimento come primo argomento");
  process.exit(1);
}

if (!SUPPORTED_DEPTS.includes(dept)) {
  console.error(`Errore: dipartimento '${dept}' non riconosciuto`);
  console.error(`Dipartimenti supportati: ${SUPPORTED_DEPTS.join(", ")}`);
  process.exit(1);
}

const _statusPath = getStatusPath(dept);
let current: Record<string, unknown> = readStatus(dept) || {
  _meta: { dept, schema_version: SCHEMA_VERSION },
  health: "unknown",
  summary: "",
};

const setIdx = args.indexOf("--set");
const patchIdx = args.indexOf("--patch");

if (setIdx !== -1) {
  const kv = args[setIdx + 1];
  if (!kv) {
    console.error("Errore: --set richiede key=value");
    process.exit(1);
  }
  const eqIdx = kv.indexOf("=");
  if (eqIdx === -1) {
    console.error("Errore: formato --set deve essere key=value");
    process.exit(1);
  }
  const key = kv.slice(0, eqIdx);
  const rawVal = kv.slice(eqIdx + 1);

  // Try to parse as JSON (for true/false/null/numbers), else keep as string
  let value: unknown = rawVal;
  try {
    value = JSON.parse(rawVal);
  } catch {
    // keep as string
  }

  setNestedKey(current, key, value);
  writeStatus(dept, current);
  console.log(`✓ [${dept}] ${key} = ${JSON.stringify(value)}`);

} else if (patchIdx !== -1) {
  const jsonStr = args[patchIdx + 1];
  if (!jsonStr) {
    console.error("Errore: --patch richiede un JSON string");
    process.exit(1);
  }
  let patch: Record<string, unknown>;
  try {
    patch = JSON.parse(jsonStr);
  } catch (e) {
    console.error(`Errore: JSON non valido — ${e}`);
    process.exit(1);
  }

  // Remove _meta from patch (managed internally)
  delete patch["_meta"];

  current = deepMerge(current, patch);
  writeStatus(dept, current);
  console.log(`✓ [${dept}] aggiornato con patch`);
  console.log(`  Campi aggiornati: ${Object.keys(patch).join(", ")}`);

} else {
  console.error("Errore: specifica --set key=value o --patch '<json>'");
  process.exit(1);
}
