/**
 * CLI Runner — Esegue agenti via `claude -p` CLI usando la subscription Claude Max.
 *
 * Zero costi API: usa la subscription, non ANTHROPIC_API_KEY.
 * Per agenti pesanti: analyzer, advisor, corpus-agent, investigator, task-executor.
 *
 * Pattern provato: copiato da app/api/console/company/route.ts (produzione).
 *
 * Funzionamento:
 *   1. Spawna `claude -p` come child process
 *   2. Stripa CLAUDE* e ANTHROPIC_API_KEY dall'env (evita nested session)
 *   3. Invia system prompt via --system-prompt e user prompt via stdin
 *   4. Raccoglie output (text mode)
 *   5. Parsifica JSON dalla risposta
 *   6. Ritorna GenerateResult-compatible
 *
 * Fallback: se CLI fallisce, agent-runner.ts cade alla catena SDK normale.
 */

import { spawn, execSync } from "child_process";
import type { GenerateResult } from "./types";

// ─── Types ───

export interface CLIRunnerConfig {
  /** CLI model alias: "opus", "sonnet", "haiku". Default "sonnet" */
  model?: string;
  /** System prompt per l'agente */
  systemPrompt?: string;
  /** Timeout in ms. Default 300_000 (5 min) */
  timeoutMs?: number;
  /** Abilita WebSearch tool (per investigator). Default false */
  enableWebSearch?: boolean;
  /** Nome agente per logging */
  agentName?: string;
}

export interface CLIRunnerResult extends GenerateResult {
  /** Se il CLI ha riportato costi (0 per subscription) */
  costUsd: number;
}

// ─── Environment Setup ───

/**
 * Crea un env pulito senza variabili che causano errori nested session
 * o forzano modalità API credits.
 *
 * Pattern copiato da app/api/console/company/route.ts (linee 145-150).
 */
function buildCleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "ANTHROPIC_API_KEY" || key.startsWith("CLAUDE")) {
      delete env[key];
    }
  }
  return env;
}

// ─── Claude binary resolution (cached) ───

let _claudePath: string | null = null;
function resolveClaudePath(): string {
  if (_claudePath) return _claudePath;
  try {
    const cmd = process.platform === "win32" ? "where claude" : "which claude";
    const result = execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();
    // 'where' on Windows may return multiple lines — take the first
    _claudePath = result.split(/\r?\n/)[0];
    return _claudePath;
  } catch {
    _claudePath = "claude";
    return _claudePath;
  }
}

// ─── Core ───

/**
 * Esegue un prompt via `claude -p` CLI.
 *
 * Usa la subscription Claude Max (non API credits).
 * Il prompt viene inviato via stdin, l'output raccolto da stdout.
 */
export async function runViaCLI(
  prompt: string,
  config: CLIRunnerConfig = {}
): Promise<CLIRunnerResult> {
  const {
    model = "sonnet",
    systemPrompt,
    timeoutMs = 300_000,
    enableWebSearch = false,
    agentName = "CLI",
  } = config;

  const args: string[] = [
    "-p",
    "--model", model,
    "--output-format", "text",
    "--no-session-persistence",
    "--dangerously-skip-permissions",
  ];

  if (systemPrompt) {
    args.push("--system-prompt", systemPrompt);
  }

  // Tools: disabilita tutti per default, abilita WebSearch se richiesto
  if (enableWebSearch) {
    args.push("--allowedTools", "WebSearch");
  }

  const start = Date.now();
  const claudeBin = resolveClaudePath();
  console.log(
    `[CLI-RUNNER] -> ${agentName} | model: ${model} | prompt: ~${prompt.length} chars | bin: ${claudeBin}`
  );

  return new Promise<CLIRunnerResult>((resolve, reject) => {
    const child = spawn(claudeBin, args, {
      cwd: process.cwd(),
      env: buildCleanEnv(),
      shell: process.platform === "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    // Invia il prompt via stdin
    child.stdin.write(prompt);
    child.stdin.end();

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const durationMs = Date.now() - start;

      if (timedOut) {
        reject(
          new Error(
            `[CLI-RUNNER] ${agentName} timed out after ${timeoutMs}ms`
          )
        );
        return;
      }

      if (code !== 0) {
        const isRateLimit =
          stderr.includes("rate limit") || stderr.includes("rate_limit");
        const isCredits =
          stderr.includes("credit") || stderr.includes("balance");
        reject(
          new Error(
            `[CLI-RUNNER] ${agentName} exit ${code}` +
              `${isRateLimit ? " (RATE_LIMIT)" : ""}` +
              `${isCredits ? " (CREDITS)" : ""}` +
              `: ${stderr.slice(0, 500)}`
          )
        );
        return;
      }

      console.log(
        `[CLI-RUNNER] <- ${agentName} | ${(durationMs / 1000).toFixed(1)}s | ${stdout.length} chars | model: ${model}`
      );

      resolve({
        text: stdout.trim(),
        usage: { inputTokens: 0, outputTokens: 0 }, // CLI non riporta token
        durationMs,
        provider: "cli",
        model,
        costUsd: 0, // Subscription: costo sempre 0
      });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `[CLI-RUNNER] ${agentName} spawn error: ${err.message}` +
            ` (claude nel PATH?)`
        )
      );
    });
  });
}

/**
 * Verifica se il CLI runner è disponibile.
 * Controlla l'env var DISABLE_CLI_RUNNER e tenta un rapido check.
 */
export function isCliRunnerEnabled(): boolean {
  if (process.env.DISABLE_CLI_RUNNER === "true") return false;
  return true;
}
