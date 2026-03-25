/**
 * API Console Company — Chat interattiva con CME/TL via Claude Code subprocess.
 *
 * Spawna `claude -p` con `--input-format stream-json` per multi-turn interattivo.
 * La sessione resta aperta: follow-up messaggi via /api/console/company/message.
 * Usa la subscription $100/mese, non le API.
 */

import { spawn, execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { getTaskBoard } from "@/lib/company/tasks";
import { getTotalSpend } from "@/lib/company/cost-logger";
import { loadFormaMentisContext } from "@/lib/company/memory/daemon-context-loader";
import {
  setSession,
  deleteSession,
  registerSession,
  unregisterSession,
  clearOutputRing,
  appendOutputLine,
} from "@/lib/company/sessions";
import { requireConsoleRole } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import type { NextRequest } from "next/server";
import { broadcastAgentEvent } from "@/lib/agent-broadcast";
import { createSSEStream, SSE_HEADERS } from "@/lib/sse-stream-factory";

export const maxDuration = 300; // Sessioni interattive possono durare di più

const TARGETS: Record<string, { promptFile: string; label: string; model: string }> = {
  cme:                { promptFile: "cme.md",                           label: "CME (CEO)",            model: "opus" },
  "ufficio-legale":   { promptFile: "ufficio-legale/department.md",     label: "Ufficio Legale TL",    model: "opus" },
  "data-engineering": { promptFile: "data-engineering/department.md",   label: "Data Engineering TL",  model: "opus" },
  "quality-assurance":{ promptFile: "quality-assurance/department.md",  label: "Quality Assurance TL", model: "opus" },
  architecture:       { promptFile: "architecture/department.md",       label: "Architecture TL",      model: "opus" },
  finance:            { promptFile: "finance/department.md",            label: "Finance TL",           model: "opus" },
  operations:         { promptFile: "operations/department.md",         label: "Operations TL",        model: "opus" },
  security:           { promptFile: "security/department.md",           label: "Security TL",          model: "opus" },
  marketing:          { promptFile: "marketing/department.md",          label: "Marketing TL",         model: "opus" },
  strategy:           { promptFile: "strategy/department.md",           label: "Strategy TL",          model: "opus" },
  trading:            { promptFile: "trading/department.md",            label: "Trading TL",           model: "opus" },
};

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

export async function POST(req: Request) {
  // SEC-M3: Rate limit — 5 per minute (spawns claude -p child process)
  const rl = await checkRateLimit(req as unknown as NextRequest);
  if (rl) return rl;

  // Admin only — spawns claude -p child process
  const authPayload = requireConsoleRole(req as unknown as NextRequest, "admin");
  if (!authPayload) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // CSRF protection
  const csrfError = checkCsrf(req as unknown as NextRequest);
  if (csrfError) return csrfError;

  try {
    const body = await req.json();
    const message: string = body.message ?? "";
    const target: string = body.target ?? "cme";
    const history: Array<{ role: string; content: string }> = body.history ?? [];

    const targetConfig = TARGETS[target];
    if (!targetConfig) {
      return new Response(JSON.stringify({ error: "Target non valido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Read the company prompt file
    const companyDir = join(process.cwd(), "company");
    let promptContent: string;
    try {
      promptContent = readFileSync(join(companyDir, targetConfig.promptFile), "utf-8");
    } catch {
      promptContent = `Sei il ${targetConfig.label} di Poimandres. Rispondi in italiano.`;
    }

    // Fetch live data + Forma Mentis context in parallel
    const [board, costs, formaMentis] = await Promise.all([
      getTaskBoard().catch(() => null),
      getTotalSpend(7).catch(() => null),
      loadFormaMentisContext().catch((e: unknown) => {
        console.error("[COMPANY-CHAT] Forma Mentis context failed:", e instanceof Error ? e.message : e);
        return null;
      }),
    ]);

    const dataContext = buildDataContext(board, costs);

    // Build Forma Mentis block for prompt injection
    let formaMentisBlock = "";
    if (formaMentis) {
      const parts: string[] = [];

      // Daemon report from disk FIRST — always available, richest source
      if (formaMentis.daemonBlock) parts.push(formaMentis.daemonBlock);

      // Session history — critical for continuity
      if (formaMentis.sessionBlock) parts.push(formaMentis.sessionBlock);

      // Recently completed tasks — prevents CME from re-proposing done work
      if (board?.recentDone && board.recentDone.length > 0) {
        const doneLines = board.recentDone.map(
          (t: { title: string; department: string; resultSummary?: string | null }) =>
            `- ${t.title} (${t.department})${t.resultSummary ? `: ${t.resultSummary.slice(0, 80)}` : ""}`
        );
        parts.push(`## TASK COMPLETATI DI RECENTE (NON riproporre)\n${doneLines.join("\n")}`);
      }

      // Department status snapshot
      if (formaMentis.statusBlock) parts.push(formaMentis.statusBlock);

      // Warnings, learnings, context from department memories
      if (formaMentis.memoryBlock) parts.push(formaMentis.memoryBlock);

      // Active goals and progress
      if (formaMentis.goalBlock) parts.push(formaMentis.goalBlock);

      if (parts.length > 0) {
        formaMentisBlock = [
          "",
          "--- CONTESTO AZIENDALE (Forma Mentis) ---",
          "ISTRUZIONI: Leggi ATTENTAMENTE questo contesto prima di rispondere.",
          "NON riproporre task già completati. NON ignorare warning attivi.",
          "Se una sessione precedente ha affrontato un problema, parti da dove si è fermata.",
          "",
          ...parts,
          "",
          "--- FINE CONTESTO AZIENDALE ---",
        ].join("\n");
        console.log(`[COMPANY-CHAT] Forma Mentis context: ${formaMentisBlock.length} chars | sessions: ${formaMentis.context.recentSessions.length} | memories: ${formaMentis.context.departmentMemories.length} | goals: ${formaMentis.context.activeGoals.length} | done tasks: ${board?.recentDone?.length ?? 0} | daemonBlock: ${formaMentis.daemonBlock.length} chars`);
      }
    }

    // System prompt — references Forma Mentis context to ensure LLM gives it weight
    const shortSystemPrompt = formaMentisBlock
      ? `Sei il ${targetConfig.label} di Poimandres. Rispondi in italiano, conciso, max 200 parole. Non inventare numeri. IMPORTANTE: il messaggio contiene un blocco "CONTESTO AZIENDALE (Forma Mentis)" con sessioni precedenti, task completati, warning e goal. DEVI leggerlo e usarlo per evitare di riproporre lavoro già fatto.`
      : `Sei il ${targetConfig.label} di Poimandres. Rispondi in italiano, conciso, max 200 parole. Non inventare numeri.`;

    // Build conversation history section (if resuming)
    let historySection = "";
    if (history.length > 0) {
      const historyLines = history.map((m) =>
        m.role === "user" ? `BOSS: ${m.content}` : `TU: ${m.content}`
      );
      historySection = [
        "",
        "## CONVERSAZIONE PRECEDENTE (continua da qui)",
        ...historyLines,
        "",
      ].join("\n");
    }

    // Build full context message for first turn
    // Forma Mentis block comes BEFORE the role prompt so it's read first
    const contextMessage = [
      formaMentisBlock || null,
      "## IL TUO RUOLO",
      promptContent,
      "## DATI AZIENDALI LIVE",
      dataContext,
      historySection || null,
      "## DOMANDA",
      message,
    ].filter(Boolean).join("\n\n");

    // Session ID for follow-up messages
    const sessionId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const projectDir = process.cwd();

    const { stream, send, sendComment, close: closeStream, onCleanup } = createSSEStream({ request: req });

        // ── Keepalive ping every 15s ──
        // Mobile browsers aggressively kill idle SSE connections (especially on screen lock).
        // Sending periodic pings keeps the TCP connection alive and helps the client detect
        // a dead connection faster (no data = connection truly lost, not just idle).
        const keepaliveInterval = setInterval(() => {
          sendComment(`keepalive ${Date.now()}`);
        }, 15_000);
        onCleanup(() => clearInterval(keepaliveInterval));

        // Auto-continuation: track turns to avoid infinite loops
        let turnCount = 0;
        const MAX_AUTO_TURNS = 50;

        const args = [
          "-p",
          "--model", targetConfig.model,
          "--system-prompt", shortSystemPrompt,
          "--input-format", "stream-json",
          "--output-format", "stream-json",
          "--verbose",
          "--no-session-persistence",
          "--strict-mcp-config",
        ];

        const claudeBin = resolveClaudePath();
        send("debug", { type: "spawn", msg: `${claudeBin} -p --model ${targetConfig.model} (interactive)`, ts: Date.now() });

        // Remove env vars that would interfere:
        // - CLAUDECODE + CLAUDE_CODE_*: avoid "nested session" error and DLL init crashes
        // - ANTHROPIC_API_KEY: force subscription mode (not API credits)
        const childEnv = { ...process.env };
        for (const key of Object.keys(childEnv)) {
          if (key === "ANTHROPIC_API_KEY" || key.startsWith("CLAUDE")) {
            delete childEnv[key];
          }
        }

        const child = spawn(claudeBin, args, {
          cwd: projectDir,
          env: childEnv,
          shell: process.platform === "win32",
          stdio: ["pipe", "pipe", "pipe"],
        });

        const terminalPid = child.pid;

        send("debug", { type: "pid", msg: `PID: ${terminalPid}`, ts: Date.now() });

        // Emit session ID so frontend can send follow-up messages
        send("session", { sessionId });

        // Store session for follow-up messages
        setSession(sessionId, { child, target });

        // Register in the tracked session registry (Layer 2) — ADR-005: include new fields
        if (terminalPid) {
          registerSession({
            pid: terminalPid,
            type: "console",
            target,
            startedAt: new Date(),
            status: "active",
            currentTask: `${targetConfig.label} chat`,
            department: target,
            sessionId,
          });
        }

        // Broadcast agent activity to Ops dashboard — ADR-005: include parentPid + sessionId
        broadcastAgentEvent({
          id: `company-${target}`,
          department: target === "cme" ? "cme" : target,
          task: `${targetConfig.label} chat`,
          status: "running",
          parentPid: terminalPid,
          sessionId,
        });

        // Send first message in stream-json format (DON'T close stdin!)
        const firstMsg = JSON.stringify({
          type: "user",
          message: {
            role: "user",
            content: [{ type: "text", text: contextMessage }],
          },
        });
        child.stdin.write(firstMsg + "\n");
        send("debug", { type: "stdin", msg: `Inviati ${contextMessage.length} chars (stream-json)`, ts: Date.now() });

        let stdoutBuffer = "";

        child.stdout.on("data", (chunk: Buffer) => {
          stdoutBuffer += chunk.toString();

          // stream-json emits one JSON object per line
          const lines = stdoutBuffer.split("\n");
          stdoutBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;

            // ADR-005: Tee raw line into ring buffer for output SSE endpoint
            if (terminalPid) {
              appendOutputLine(terminalPid, `[STDOUT] ${line}`);
            }

            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const event: any = JSON.parse(line);

              switch (event.type) {
                case "system":
                  send("debug", {
                    type: "init",
                    msg: `Model: ${event.model} | Tools: ${event.tools?.length ?? 0} | Mode: ${event.permissionMode} | ApiKey: ${event.apiKeySource ?? "subscription"}`,
                    ts: Date.now(),
                  });
                  break;

                case "assistant": {
                  const content = event.message?.content;
                  if (Array.isArray(content)) {
                    for (const block of content) {
                      if (block.type === "thinking" && block.thinking) {
                        const preview = block.thinking.slice(0, 150).replace(/\n/g, " ");
                        send("debug", { type: "thinking", msg: preview, ts: Date.now() });
                      }
                      if (block.type === "text" && block.text) {
                        send("chunk", { text: block.text });
                        send("debug", { type: "text", msg: `+${block.text.length} chars`, ts: Date.now() });
                      }
                      if (block.type === "tool_use") {
                        send("debug", {
                          type: "tool",
                          msg: `${block.name}(${JSON.stringify(block.input).slice(0, 120)})`,
                          ts: Date.now(),
                        });
                      }
                    }
                  }
                  break;
                }

                case "tool_result":
                  send("debug", {
                    type: "tool-result",
                    msg: `${event.tool_name ?? "tool"}: ${String(event.output ?? "").slice(0, 150)}`,
                    ts: Date.now(),
                  });
                  break;

                case "result": {
                  turnCount++;
                  send("debug", {
                    type: "result",
                    msg: `Turn ${turnCount}/${MAX_AUTO_TURNS} | ${event.duration_ms}ms | $${event.total_cost_usd?.toFixed(4) ?? "?"} | turns: ${event.num_turns}`,
                    ts: Date.now(),
                  });
                  send("turn-end", {
                    duration_ms: event.duration_ms,
                    cost_usd: event.total_cost_usd,
                    num_turns: event.num_turns,
                    result: event.result,
                  });

                  // Auto-continuation: ALWAYS continue UNLESS CME explicitly signals
                  // it's waiting for the boss. This inverts the old fragile approach
                  // (matching Italian verbs for pending work) with a robust opt-out:
                  // continue by default, stop only on explicit completion phrases.
                  const resultText = typeof event.result === "string" ? event.result : "";
                  // Only match explicit "waiting for boss" / "nothing to do" phrases
                  const isWaitingForBoss = /su cosa vuoi|aspetto.*(?:go|ok|boss|ordini|istruzioni)|in attesa|dimmi cosa|a tua disposizione|board.*vuoto.*0 open/i.test(resultText);
                  // Empty result = tools were used (Agent/Bash) → always continue
                  const shouldContinue = !isWaitingForBoss && turnCount < MAX_AUTO_TURNS;

                  if (shouldContinue) {
                    send("debug", { type: "auto-continue", msg: `Turn ${turnCount}: continuing (not waiting for boss)`, ts: Date.now() });
                    const followUp = JSON.stringify({
                      type: "user",
                      message: {
                        role: "user",
                        content: [{ type: "text", text: "Procedi. Esegui i task che hai pianificato. Completa il ciclo: routing → esecuzione dipartimento → done → feedback. Non fermarti." }],
                      },
                    });
                    try { child.stdin.write(followUp + "\n"); } catch { /* stdin closed */ }
                  } else if (turnCount >= MAX_AUTO_TURNS) {
                    send("debug", { type: "auto-continue", msg: `Max turns (${MAX_AUTO_TURNS}) reached, stopping`, ts: Date.now() });
                  } else {
                    send("debug", { type: "auto-continue", msg: `Turn ${turnCount}: waiting for boss (explicit stop detected)`, ts: Date.now() });
                  }
                  break;
                }

                case "rate_limit_event":
                  send("debug", {
                    type: "rate-limit",
                    msg: `Status: ${event.rate_limit_info?.status} | Resets: ${event.rate_limit_info?.resetsAt ? new Date(event.rate_limit_info.resetsAt * 1000).toLocaleTimeString() : "?"}`,
                    ts: Date.now(),
                  });
                  break;
              }
            } catch {
              // non-JSON line, skip
            }
          }
        });

        let stderrOutput = "";
        child.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString().trim();
          if (text) {
            stderrOutput += text + "\n";
            // ADR-005: Tee stderr into ring buffer
            if (terminalPid) {
              appendOutputLine(terminalPid, `[STDERR] ${text}`);
            }
            send("debug", { type: "stderr", msg: text.slice(0, 300), ts: Date.now() });
          }
        });

        child.on("close", (code) => {
          deleteSession(sessionId);
          if (terminalPid) {
            unregisterSession(terminalPid);
            // ADR-005: Clear ring buffer on session close
            clearOutputRing(terminalPid);
          }
          // Broadcast completion to Ops dashboard — ADR-005: include parentPid + sessionId
          broadcastAgentEvent({
            id: `company-${target}`,
            department: target === "cme" ? "cme" : target,
            task: `${targetConfig.label} chat`,
            status: code === 0 ? "done" : "error",
            parentPid: terminalPid,
            sessionId,
          });
          send("debug", { type: "exit", msg: `Codice uscita: ${code}`, ts: Date.now() });
          if (code !== 0) {
            // Check for credit/rate limit errors in stderr
            const isCredits = stderrOutput.toLowerCase().includes("credit") || stderrOutput.toLowerCase().includes("balance");
            const isRateLimit = stderrOutput.toLowerCase().includes("rate limit") || stderrOutput.toLowerCase().includes("rate_limit");
            if (isCredits || isRateLimit) {
              send("chunk", { text: `Crediti subscription esauriti per questa finestra di 5 ore. Attendi il reset (vedi rate-limit nel debug) oppure riprova più tardi.` });
            }
            send("error", { error: `Claude Code exit ${code}: ${stderrOutput.slice(0, 500)}` });
          }
          send("done", { target, sessionId });
          closeStream();
        });

        child.on("error", (err) => {
          deleteSession(sessionId);
          if (terminalPid) {
            unregisterSession(terminalPid);
            // ADR-005: Clear ring buffer on error
            clearOutputRing(terminalPid);
          }
          broadcastAgentEvent({
            id: `company-${target}`,
            department: target === "cme" ? "cme" : target,
            task: `${targetConfig.label} errore`,
            status: "error",
            parentPid: terminalPid,
            sessionId,
          });
          send("debug", { type: "spawn-error", msg: err.message, ts: Date.now() });
          send("error", { error: `Errore spawn: ${err.message}. Claude Code è installato?` });
          closeStream();
        });

        // Clean up child process + session on client disconnect
        onCleanup(() => {
          try { child.kill("SIGTERM"); } catch {}
          deleteSession(sessionId);
          // child.on("close") handler will unregister from tracker
        });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Errore sconosciuto";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDataContext(board: any, costs: any): string {
  const lines: string[] = [];

  if (board) {
    lines.push("### Task Board");
    lines.push(`Totale: ${board.total}`);
    if (board.byStatus) {
      const s = board.byStatus;
      lines.push(`Open: ${s.open ?? 0} | In Progress: ${s.in_progress ?? 0} | Review: ${s.review ?? 0} | Done: ${s.done ?? 0} | Blocked: ${s.blocked ?? 0} | On Hold: ${s.on_hold ?? 0}`);
    }
    if (board.byDepartment) {
      lines.push("\nPer dipartimento:");
      for (const [dept, info] of Object.entries(board.byDepartment) as [string, { total: number; open: number; done: number }][]) {
        lines.push(`- ${dept}: ${info.total} (${info.open} open, ${info.done} done)`);
      }
    }
    if (board.recent?.length) {
      lines.push("\nTask recenti:");
      for (const task of board.recent.slice(0, 5)) {
        lines.push(`- [${task.status}] ${task.priority} | ${task.title} (${task.department})`);
      }
    }
  } else {
    lines.push("Task board: non disponibile");
  }

  if (costs) {
    lines.push("\n### Costi (7 giorni)");
    lines.push(`Totale: $${costs.total.toFixed(4)} | Chiamate: ${costs.calls}`);
    if (costs.byProvider) {
      for (const [prov, info] of Object.entries(costs.byProvider) as [string, { cost: number; calls: number }][]) {
        lines.push(`- ${prov}: $${info.cost.toFixed(4)} (${info.calls})`);
      }
    }
  }

  return lines.join("\n");
}
