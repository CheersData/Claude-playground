/**
 * POST /api/ops/exec
 *
 * Execute a whitelisted CLI command and stream output via SSE.
 *
 * Security:
 *   - Strict allowlist of command prefixes (NON-NEGOTIABLE)
 *   - requireConsoleAuth (HMAC-SHA256 token)
 *   - CSRF check
 *   - Rate limit: 10/min
 *   - Timeout: 5 minutes per command
 *
 * SSE events:
 *   event: output  -- stdout chunk (data: { stream: "stdout", text: string })
 *   event: error   -- stderr chunk (data: { stream: "stderr", text: string })
 *   event: exit    -- process exited (data: { code: number | null, signal: string | null, pid: number })
 *
 * Body: { command: string }
 *
 * Working directory: project root (controlla-me/)
 */

import { spawn, type ChildProcess } from "child_process";
import { NextRequest } from "next/server";
import { requireConsoleRole } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import path from "path";
import { createSSEStream, SSE_HEADERS } from "@/lib/sse-stream-factory";

export const maxDuration = 300;

// ─── Command Allowlist (NON-NEGOTIABLE) ────────────────────────────────────

const ALLOWED_PREFIXES: readonly string[] = [
  "npx tsx scripts/company-tasks.ts",
  "npx tsx scripts/forma-mentis.ts",
  "npx tsx scripts/dept-context.ts",
  "npx tsx scripts/daily-standup.ts",
  "npx tsx scripts/data-connector.ts",
  "npx tsx scripts/check-data.ts",
  "npx tsx scripts/corpus-sources.ts",
  "npx tsx scripts/update-dept-status.ts",
  "git status",
  "git log --oneline -20",
  "npm run build",
  "npm run lint",
] as const;

/**
 * Validate that a command matches exactly one of the allowed prefixes.
 * The command must start with an allowed prefix and:
 *   - Be exactly the prefix, OR
 *   - Have a space after the prefix (i.e. additional args are allowed for script commands)
 *
 * For "git log --oneline -20" and "git status", "npm run build", "npm run lint":
 *   must be an exact match (no extra args allowed — prevents injection).
 */
const EXACT_MATCH_COMMANDS = new Set([
  "git status",
  "git log --oneline -20",
  "npm run build",
  "npm run lint",
]);

function isCommandAllowed(command: string): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;

  // Check exact-match commands first
  if (EXACT_MATCH_COMMANDS.has(trimmed)) return true;

  // Check prefix-based commands (scripts that accept arguments)
  for (const prefix of ALLOWED_PREFIXES) {
    if (EXACT_MATCH_COMMANDS.has(prefix)) continue; // skip exact-match ones
    if (trimmed === prefix || trimmed.startsWith(prefix + " ")) {
      return true;
    }
  }

  return false;
}

// Reject shell metacharacters that could enable command injection.
// Even though we use spawn (no shell by default), and we have an allowlist,
// this is defense-in-depth: arguments after the prefix must not contain
// characters that could be exploited if a shell were somehow invoked.
const DANGEROUS_CHARS = /[;&|`$(){}\\<>!\n\r]/;

function hasDangerousChars(command: string): boolean {
  // Only check the arguments portion (after the matched prefix)
  const trimmed = command.trim();
  for (const prefix of ALLOWED_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      const args = trimmed.slice(prefix.length);
      if (args.length === 0) return false;
      return DANGEROUS_CHARS.test(args);
    }
  }
  return false;
}

// ─── Active processes (for kill endpoint) ──────────────────────────────────

/** Map of PID -> ChildProcess for active commands. Exported for the kill route. */
const activeProcesses = new Map<number, ChildProcess>();

export function getActiveProcess(pid: number): ChildProcess | undefined {
  return activeProcesses.get(pid);
}

export function removeActiveProcess(pid: number): void {
  activeProcesses.delete(pid);
}

// ─── Timeout ───────────────────────────────────────────────────────────────

const COMMAND_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─── Project root detection ────────────────────────────────────────────────

function getProjectRoot(): string {
  // process.cwd() in Next.js is the project root
  // Fallback: resolve from this file's location
  const cwd = process.cwd();
  if (cwd.endsWith("controlla-me") || cwd.includes("controlla-me")) {
    return cwd;
  }
  // Fallback: navigate up from this file
  return path.resolve(__dirname, "../../../../");
}

// ─── Route Handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // CSRF check
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  // Rate limiting: 10/min
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // Auth: requireConsoleRole — boss only (shell command execution)
  const tokenPayload = requireConsoleRole(req, "boss");
  if (!tokenPayload) {
    return new Response(
      JSON.stringify({ error: "Non autorizzato" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  // Parse body
  let command: string;
  try {
    const body = await req.json();
    command = typeof body.command === "string" ? body.command.trim() : "";
  } catch {
    return new Response(
      JSON.stringify({ error: "Body JSON invalido" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!command) {
    return new Response(
      JSON.stringify({ error: "Comando vuoto" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Allowlist check (NON-NEGOTIABLE) ──
  if (!isCommandAllowed(command)) {
    console.warn(
      `[OPS-EXEC] BLOCKED command from ${tokenPayload.nome} ${tokenPayload.cognome}: "${command}"`
    );
    return new Response(
      JSON.stringify({
        error: "Comando non consentito",
        hint: "Solo comandi dalla allowlist sono permessi",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Defense-in-depth: reject dangerous shell metacharacters ──
  if (hasDangerousChars(command)) {
    console.warn(
      `[OPS-EXEC] BLOCKED dangerous chars from ${tokenPayload.nome} ${tokenPayload.cognome}: "${command}"`
    );
    return new Response(
      JSON.stringify({
        error: "Comando contiene caratteri non consentiti",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const operatorName = `${tokenPayload.nome} ${tokenPayload.cognome}`;
  console.log(`[OPS-EXEC] ${operatorName} executing: ${command}`);

  // ── Spawn process ──
  const projectRoot = getProjectRoot();
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  // Use spawn WITHOUT shell (defense-in-depth: no shell expansion)
  // On Windows, npx/npm need to resolve via .cmd wrapper
  const isWindows = process.platform === "win32";
  const resolvedCmd = isWindows && (cmd === "npx" || cmd === "npm" || cmd === "git")
    ? `${cmd}.cmd`
    : cmd;

  let child: ChildProcess;
  try {
    child = spawn(resolvedCmd, args, {
      cwd: projectRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      // On Windows, .cmd files need shell: false still works with .cmd extension
      windowsHide: true,
    });
  } catch (spawnError) {
    const errMsg = spawnError instanceof Error ? spawnError.message : String(spawnError);
    console.error(`[OPS-EXEC] spawn failed: ${errMsg}`);
    return new Response(
      JSON.stringify({ error: `Spawn fallito: ${errMsg}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const pid = child.pid;
  if (pid === undefined) {
    return new Response(
      JSON.stringify({ error: "Processo non avviato (PID undefined)" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Track the process
  activeProcesses.set(pid, child);

  // ── Timeout: kill after 5 minutes ──
  const timeoutTimer = setTimeout(() => {
    if (child.exitCode === null && !child.killed) {
      console.warn(`[OPS-EXEC] Timeout (${COMMAND_TIMEOUT_MS}ms) for PID ${pid}: ${command}`);
      try {
        child.kill("SIGTERM");
      } catch {
        // Process may have already exited
      }
    }
  }, COMMAND_TIMEOUT_MS);

  // ── SSE Stream ──
  const { stream, send, close: closeStream, onCleanup } = createSSEStream({ request: req });

  // Register cleanup for timeout timer and child process
  onCleanup(() => {
    clearTimeout(timeoutTimer);
    // Kill the process if still running
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // Process may have already exited
      }
    }
    activeProcesses.delete(pid);
  });

  // Send PID immediately so the client can use it for kill
  send("started", { pid, command });

  // stdout
  if (child.stdout) {
    child.stdout.on("data", (chunk: Buffer) => {
      send("output", { stream: "stdout", text: chunk.toString("utf-8") });
    });
  }

  // stderr
  if (child.stderr) {
    child.stderr.on("data", (chunk: Buffer) => {
      send("error", { stream: "stderr", text: chunk.toString("utf-8") });
    });
  }

  // Process exit
  child.on("close", (code, signal) => {
    send("exit", {
      code: code ?? null,
      signal: signal ?? null,
      pid,
    });
    closeStream();
  });

  // Spawn error (e.g., ENOENT)
  child.on("error", (err) => {
    send("error", {
      stream: "stderr",
      text: `spawn error: ${err.message}`,
    });
    send("exit", { code: 1, signal: null, pid });
    closeStream();
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
