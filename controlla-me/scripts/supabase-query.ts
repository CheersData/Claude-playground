#!/usr/bin/env npx tsx
/**
 * Supabase Query CLI — Run arbitrary SQL against the Supabase PostgreSQL database.
 *
 * Usage:
 *   npx tsx scripts/supabase-query.ts "SELECT * FROM profiles LIMIT 5"
 *   npx tsx scripts/supabase-query.ts --file supabase/migrations/050_something.sql
 *   npx tsx scripts/supabase-query.ts --file supabase/migrations/050_something.sql --dry-run
 *   npx tsx scripts/supabase-query.ts "UPDATE profiles SET plan = 'pro' WHERE id = '...'" --dry-run
 *
 * Flags:
 *   --file <path>   Read SQL from a file instead of CLI argument
 *   --dry-run       Show the SQL without executing it
 *
 * Requires DATABASE_URL in .env.local (Supabase PostgreSQL connection string).
 */

import * as dns from "dns";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Force IPv4 first — Supabase db host resolves to IPv6 only on some networks
dns.setDefaultResultOrder("ipv4first");

dotenv.config({ path: path.resolve(__dirname, "../.env.local"), override: true });

// Self-timeout: auto-exit after 1 min to prevent zombie accumulation
import { enableSelfTimeout } from "../lib/company/self-preservation";
enableSelfTimeout(60_000);

import { Client } from "pg";

// ─── CLI Parsing ───

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

/** Flags that take a value (next arg is consumed). Boolean flags like --dry-run are NOT listed. */
const VALUE_FLAGS = new Set(["--file"]);

/** Get the first positional arg (not a flag or flag value). */
function getPositionalArg(): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      if (VALUE_FLAGS.has(args[i])) {
        i++; // skip the flag's value
      }
      continue;
    }
    return args[i];
  }
  return undefined;
}

// ─── Resolve SQL ───

function resolveSQL(): string {
  const filePath = getFlag("file");
  if (filePath) {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) {
      console.error(`[ERROR] File non trovato: ${resolved}`);
      process.exit(1);
    }
    return fs.readFileSync(resolved, "utf-8").trim();
  }

  const inline = getPositionalArg();
  if (inline) return inline.trim();

  console.error(`[ERROR] Nessun SQL fornito.

Uso:
  npx tsx scripts/supabase-query.ts "SELECT * FROM profiles LIMIT 5"
  npx tsx scripts/supabase-query.ts --file supabase/migrations/050_something.sql
  npx tsx scripts/supabase-query.ts --dry-run "SELECT 1"
`);
  process.exit(1);
}

// ─── Pretty-print table ───

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log("(0 righe)");
    return;
  }

  const columns = Object.keys(rows[0]);

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const col of columns) {
    widths[col] = col.length;
  }
  for (const row of rows) {
    for (const col of columns) {
      const val = formatValue(row[col]);
      widths[col] = Math.max(widths[col], val.length);
    }
  }

  // Cap column widths at 60 chars for readability
  const MAX_COL_WIDTH = 60;
  for (const col of columns) {
    widths[col] = Math.min(widths[col], MAX_COL_WIDTH);
  }

  // Header
  const header = columns.map((c) => c.padEnd(widths[c])).join(" | ");
  const separator = columns.map((c) => "-".repeat(widths[c])).join("-+-");

  console.log(header);
  console.log(separator);

  // Rows
  for (const row of rows) {
    const line = columns
      .map((c) => {
        const val = formatValue(row[c]);
        return val.length > widths[c] ? val.slice(0, widths[c] - 3) + "..." : val.padEnd(widths[c]);
      })
      .join(" | ");
    console.log(line);
  }

  console.log(`\n(${rows.length} ${rows.length === 1 ? "riga" : "righe"})`);
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

// ─── Split SQL into statements ───

/**
 * Splits SQL text into individual statements by semicolons,
 * respecting string literals (single quotes) and dollar-quoted strings.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];

    // Single-quoted string
    if (ch === "'") {
      current += ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += "''";
          i += 2;
        } else if (sql[i] === "'") {
          current += "'";
          i++;
          break;
        } else {
          current += sql[i];
          i++;
        }
      }
      continue;
    }

    // Dollar-quoted string ($$...$$, $tag$...$tag$)
    if (ch === "$") {
      const dollarMatch = sql.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
      if (dollarMatch) {
        const tag = dollarMatch[1];
        current += tag;
        i += tag.length;
        const endIdx = sql.indexOf(tag, i);
        if (endIdx !== -1) {
          current += sql.slice(i, endIdx + tag.length);
          i = endIdx + tag.length;
        } else {
          // No closing tag — take rest of string
          current += sql.slice(i);
          i = sql.length;
        }
        continue;
      }
    }

    // Line comment
    if (ch === "-" && sql[i + 1] === "-") {
      const newline = sql.indexOf("\n", i);
      if (newline === -1) {
        i = sql.length;
      } else {
        current += sql.slice(i, newline + 1);
        i = newline + 1;
      }
      continue;
    }

    // Block comment
    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) {
        current += sql.slice(i);
        i = sql.length;
      } else {
        current += sql.slice(i, end + 2);
        i = end + 2;
      }
      continue;
    }

    // Statement separator
    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  // Last statement (without trailing semicolon)
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }

  return statements;
}

// ─── Detect query type ───

function isSelectLike(sql: string): boolean {
  const upper = sql.trimStart().toUpperCase();
  return (
    upper.startsWith("SELECT") ||
    upper.startsWith("WITH") ||
    upper.startsWith("TABLE") ||
    upper.startsWith("VALUES") ||
    upper.startsWith("SHOW") ||
    upper.startsWith("EXPLAIN") ||
    upper.startsWith("\\D")
  );
}

// ─── Main ───

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[ERROR] DATABASE_URL non trovato in .env.local");
    console.error("Aggiungi: DATABASE_URL=postgresql://user:pass@host:5432/dbname");
    process.exit(1);
  }

  const sql = resolveSQL();
  const dryRun = hasFlag("dry-run");

  if (dryRun) {
    console.log("=== DRY RUN — SQL che verrebbe eseguito ===\n");
    console.log(sql);
    console.log("\n=== Fine DRY RUN (nessuna query eseguita) ===");
    process.exit(0);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("[OK] Connesso a Supabase PostgreSQL\n");

    const statements = splitStatements(sql);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      if (statements.length > 1) {
        console.log(`--- Statement ${i + 1}/${statements.length} ---`);
      }

      const start = Date.now();
      const result = await client.query(stmt);
      const elapsed = Date.now() - start;

      if (isSelectLike(stmt) && result.rows) {
        printTable(result.rows);
      } else {
        // DDL or DML
        const command = result.command || "OK";
        const affected = result.rowCount ?? 0;
        console.log(`[${command}] ${affected} ${affected === 1 ? "riga" : "righe"} affected`);
      }

      console.log(`(${elapsed}ms)\n`);
    }
  } catch (err: unknown) {
    const pgErr = err as {
      message?: string;
      code?: string;
      detail?: string;
      hint?: string;
      position?: string;
    };

    console.error(`\n[ERROR] Query fallita`);
    if (pgErr.code) console.error(`  Codice:    ${pgErr.code}`);
    if (pgErr.message) console.error(`  Messaggio: ${pgErr.message}`);
    if (pgErr.detail) console.error(`  Dettaglio: ${pgErr.detail}`);
    if (pgErr.hint) console.error(`  Suggerimento: ${pgErr.hint}`);
    if (pgErr.position) console.error(`  Posizione: carattere ${pgErr.position}`);

    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
