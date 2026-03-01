/**
 * API Console Company — Chat interattiva con CME/TL via Claude Code subprocess.
 *
 * Spawna `claude -p` con `--input-format stream-json` per multi-turn interattivo.
 * La sessione resta aperta: follow-up messaggi via /api/console/company/message.
 * Usa la subscription $100/mese, non le API.
 */

import { spawn } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import { getTaskBoard } from "@/lib/company/tasks";
import { getTotalSpend } from "@/lib/company/cost-logger";
import { setSession, deleteSession } from "@/lib/company/sessions";

export const maxDuration = 300; // Sessioni interattive possono durare di più

const TARGETS: Record<string, { promptFile: string; label: string; model: string }> = {
  cme:                { promptFile: "cme.md",                           label: "CME (CEO)",            model: "sonnet" },
  "ufficio-legale":   { promptFile: "ufficio-legale/department.md",     label: "Ufficio Legale TL",    model: "sonnet" },
  "data-engineering": { promptFile: "data-engineering/department.md",   label: "Data Engineering TL",  model: "sonnet" },
  "quality-assurance":{ promptFile: "quality-assurance/department.md",  label: "Quality Assurance TL", model: "sonnet" },
  architecture:       { promptFile: "architecture/department.md",       label: "Architecture TL",      model: "sonnet" },
  finance:            { promptFile: "finance/department.md",            label: "Finance TL",           model: "sonnet" },
  operations:         { promptFile: "operations/department.md",         label: "Operations TL",        model: "sonnet" },
  security:           { promptFile: "security/department.md",           label: "Security TL",          model: "sonnet" },
  marketing:          { promptFile: "marketing/department.md",          label: "Marketing TL",         model: "sonnet" },
  strategy:           { promptFile: "strategy/department.md",           label: "Strategy TL",          model: "sonnet" },
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message: string = body.message ?? "";
    const target: string = body.target ?? "cme";

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
      promptContent = `Sei il ${targetConfig.label} di Controlla.me. Rispondi in italiano.`;
    }

    // Fetch live data for context
    const [board, costs] = await Promise.all([
      getTaskBoard().catch(() => null),
      getTotalSpend(7).catch(() => null),
    ]);

    const dataContext = buildDataContext(board, costs);

    // Short system prompt for CLI arg (avoids Windows cmd length limit)
    const shortSystemPrompt = `Sei il ${targetConfig.label} di Controlla.me. Rispondi in italiano, conciso (max 200 parole). Non inventare numeri.`;

    // Build full context message for first turn
    const contextMessage = [
      "## IL TUO RUOLO",
      promptContent,
      "",
      "## DATI AZIENDALI LIVE",
      dataContext,
      "",
      "## DOMANDA",
      message,
    ].join("\n");

    // Session ID for follow-up messages
    const sessionId = `cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const projectDir = process.cwd();

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            // Controller may be closed
          }
        };

        const args = [
          "-p",
          "--model", targetConfig.model,
          "--system-prompt", shortSystemPrompt,
          "--input-format", "stream-json",
          "--output-format", "stream-json",
          "--verbose",
          "--no-session-persistence",
          "--dangerously-skip-permissions",
        ];

        send("debug", { type: "spawn", msg: `claude -p --model ${targetConfig.model} (interactive)`, ts: Date.now() });

        // Remove env vars that would interfere:
        // - CLAUDECODE + CLAUDE_CODE_*: avoid "nested session" error and DLL init crashes
        // - ANTHROPIC_API_KEY: force subscription mode (not API credits)
        const childEnv = { ...process.env };
        for (const key of Object.keys(childEnv)) {
          if (key === "ANTHROPIC_API_KEY" || key.startsWith("CLAUDE")) {
            delete childEnv[key];
          }
        }

        const child = spawn("claude", args, {
          cwd: projectDir,
          env: childEnv,
          shell: true,
          stdio: ["pipe", "pipe", "pipe"],
        });

        send("debug", { type: "pid", msg: `PID: ${child.pid}`, ts: Date.now() });

        // Emit session ID so frontend can send follow-up messages
        send("session", { sessionId });

        // Store session for follow-up messages
        setSession(sessionId, { child, target });

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

                case "result":
                  send("debug", {
                    type: "result",
                    msg: `${event.duration_ms}ms | $${event.total_cost_usd?.toFixed(4) ?? "?"} | turns: ${event.num_turns}`,
                    ts: Date.now(),
                  });
                  // Signal end of current turn (session stays open for follow-ups!)
                  send("turn-end", {
                    duration_ms: event.duration_ms,
                    cost_usd: event.total_cost_usd,
                    num_turns: event.num_turns,
                    result: event.result,
                  });
                  break;

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
            send("debug", { type: "stderr", msg: text.slice(0, 300), ts: Date.now() });
          }
        });

        child.on("close", (code) => {
          deleteSession(sessionId);
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
          controller.close();
        });

        child.on("error", (err) => {
          deleteSession(sessionId);
          send("debug", { type: "spawn-error", msg: err.message, ts: Date.now() });
          send("error", { error: `Errore spawn: ${err.message}. Claude Code è installato?` });
          controller.close();
        });
      },

      cancel() {
        // Client disconnected — clean up child process
        deleteSession(sessionId);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
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
      lines.push(`Open: ${s.open ?? 0} | In Progress: ${s.in_progress ?? 0} | Review: ${s.review ?? 0} | Done: ${s.done ?? 0} | Blocked: ${s.blocked ?? 0}`);
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
