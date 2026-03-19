/**
 * Integration Setup Agent v2 — Conversational agent for configuring
 * ANY external data connector via `claude -p` CLI.
 *
 * Key changes from v1:
 *   - Uses `spawnSync("claude", ["-p", ...])` (CLI subscription, NOT API SDK)
 *   - Massive system prompt with knowledge of 5 preset connectors + custom APIs
 *   - User context injection (connections, record counts, syncs, credentials)
 *   - Universal connector: handles ANY REST API, not just 5 presets
 *   - Two-pass entity discovery still works via local catalog lookup
 *
 * Pattern taken from `app/api/console/company/route.ts` (the proven CLI pattern).
 *
 * DEMO ENVIRONMENT NOTE:
 * The `claude` CLI must be in PATH and the user must have an active subscription.
 * In demo environments where `claude` is not available, the agent falls back to
 * a structured error message.
 */

import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { buildIntegrationSystemPrompt } from "../prompts/integration-setup";
import {
  discoverEntities,
  searchEntities,
  type DiscoveredEntity,
} from "../staff/data-connector/entity-discovery";
import {
  loadUserIntegrationContext,
  formatContextForPrompt,
} from "./integration-context";
import { runAgent } from "../ai-sdk/agent-runner";

// ─── Types ───

export interface SetupAgentMessage {
  role: "user" | "agent";
  content: string;
  action?: string;
  questions?: string[];
  discoveredSchema?: { fields: string[]; entityTypes: string[] };
  proposedMapping?: Array<{
    sourceField: string;
    targetField: string;
    confidence: number;
  }>;
  connectorConfig?: Record<string, unknown>;
  needsUserInput?: boolean;
}

export interface SetupAgentResult {
  message: string;
  action:
    | "ask_details"
    | "discover_entities"
    | "test_connection"
    | "propose_mapping"
    | "propose_connector_config"
    | "confirm_setup"
    | "error";
  questions?: string[];
  discoveredSchema?: { fields: string[]; entityTypes: string[] };
  proposedMapping?: Array<{
    sourceField: string;
    targetField: string;
    confidence: number;
  }>;
  connectorConfig?: Record<string, unknown>;
  needsUserInput?: boolean;
  discoveredEntities?: DiscoveredEntity[];
  connectorId?: string;
  provider?: string;
  durationMs?: number;
}

// ─── Parsed response type (from LLM) ───

interface SetupParsedResponse {
  message?: string;
  action?: string;
  questions?: string[];
  discoveredSchema?: { fields: string[]; entityTypes: string[] };
  proposedMapping?: Array<{
    sourceField: string;
    targetField: string;
    confidence: number;
  }>;
  connectorConfig?: Record<string, unknown>;
  needsUserInput?: boolean;
  discoveryQuery?: string;
  connectorId?: string;
}

// ─── Valid actions ───

const VALID_ACTIONS = [
  "ask_details",
  "discover_entities",
  "test_connection",
  "propose_mapping",
  "propose_connector_config",
  "confirm_setup",
  "error",
] as const;

type ValidAction = (typeof VALID_ACTIONS)[number];

// ─── Conversation formatting ───

/**
 * Formats the conversation history into a context string for the LLM.
 * Includes role labels and structured data from previous turns.
 */
function formatConversationHistory(
  history: SetupAgentMessage[],
  userMessage: string
): string {
  const parts: string[] = [];

  if (history.length > 0) {
    parts.push("CRONOLOGIA CONVERSAZIONE:");
    for (const msg of history) {
      const role = msg.role === "user" ? "UTENTE" : "ASSISTENTE";
      parts.push(`${role}: ${msg.content}`);

      // Include structured data from agent responses for context
      if (msg.role === "agent") {
        if (msg.action) {
          parts.push(`  [action: ${msg.action}]`);
        }
        if (msg.discoveredSchema) {
          parts.push(
            `  [schema: ${JSON.stringify(msg.discoveredSchema)}]`
          );
        }
        if (msg.proposedMapping && msg.proposedMapping.length > 0) {
          parts.push(
            `  [mapping: ${msg.proposedMapping.length} campi proposti]`
          );
        }
        if (msg.connectorConfig) {
          parts.push(
            `  [connectorConfig: ${JSON.stringify(msg.connectorConfig).slice(0, 200)}]`
          );
        }
      }
    }
    parts.push("");
  }

  parts.push(`MESSAGGIO UTENTE:\n${userMessage}`);

  return parts.join("\n");
}

// ─── CLI spawn helper ───

/**
 * Spawn `claude -p` with the given system prompt and user prompt.
 *
 * Uses a temp file for the system prompt to avoid Windows cmd length limits.
 * The --system-prompt flag has a ~8192 char limit on Windows, and our
 * comprehensive prompt is ~15-20K chars.
 *
 * Pattern from `app/api/console/company/route.ts`:
 * - Strip ANTHROPIC_API_KEY and CLAUDE* env vars to force subscription mode
 * - Use --output-format text for simple text output
 * - Use --no-session-persistence to avoid state leaks between calls
 */
function spawnClaude(
  systemPrompt: string,
  userPrompt: string,
  timeoutMs: number = 120_000
): { stdout: string; stderr: string; exitCode: number | null } {
  // Write system prompt to a temp file (Windows cmd length limit workaround)
  const tmpDir = join(process.cwd(), ".tmp");
  try {
    mkdirSync(tmpDir, { recursive: true });
  } catch {
    // Directory may already exist
  }

  const tmpFile = join(tmpDir, `integration-prompt-${randomUUID()}.txt`);

  try {
    writeFileSync(tmpFile, systemPrompt, "utf-8");

    // Build sanitized environment
    const env: Record<string, string | undefined> = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key === "ANTHROPIC_API_KEY" || key.startsWith("CLAUDE")) {
        delete env[key];
      }
    }

    const args = [
      "-p",
      userPrompt,
      "--system-prompt-file",
      tmpFile,
      "--output-format",
      "text",
      "--no-session-persistence",
    ];

    const result = spawnSync("claude", args, {
      cwd: process.cwd(),
      env: env as NodeJS.ProcessEnv,
      shell: true,
      encoding: "utf-8",
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024, // 1MB
    });

    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status,
    };
  } finally {
    // Clean up temp file
    try {
      unlinkSync(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ─── JSON parser (robust, handles imperfect LLM output) ───

/**
 * Parse JSON from LLM output. Handles common issues:
 * 1. Direct parse
 * 2. Strip code fences (```json ... ```)
 * 3. Extract first { ... } block via regex
 * 4. Return error
 */
function parseAgentResponse(raw: string): SetupParsedResponse {
  const trimmed = raw.trim();

  // 1. Direct parse
  try {
    return JSON.parse(trimmed) as SetupParsedResponse;
  } catch {
    // Continue to fallbacks
  }

  // 2. Strip code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as SetupParsedResponse;
    } catch {
      // Continue
    }
  }

  // 3. Extract first { ... } block
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as SetupParsedResponse;
    } catch {
      // Continue
    }
  }

  // 4. Last resort: treat the whole output as the message
  console.error(
    `[INTEGRATION-SETUP] Failed to parse JSON. Raw output (first 500 chars): ${trimmed.slice(0, 500)}`
  );

  return {
    message: trimmed.length > 0
      ? trimmed.slice(0, 1000)
      : "Mi dispiace, non sono riuscito a generare una risposta strutturata. Riprova.",
    action: "error",
    needsUserInput: true,
  };
}

// ─── Main ───

/**
 * Esegue un turno dell'agente di setup integrazione.
 *
 * Supports a two-pass flow for entity discovery:
 *   1. LLM returns action "discover_entities" with discoveryQuery + connectorId
 *   2. We run the discovery locally (no API needed)
 *   3. We inject the results as context and re-run the LLM to produce a user-facing message
 *
 * @param conversationHistory - Cronologia della conversazione precedente
 * @param userMessage - Ultimo messaggio dell'utente
 * @param contextConnectorId - Optional connectorId from the page context
 * @param userId - User ID for context loading (optional, falls back to no context)
 * @returns Risposta strutturata dell'agente
 */
export async function runSetupAgent(
  conversationHistory: SetupAgentMessage[],
  userMessage: string,
  contextConnectorId?: string,
  userId?: string
): Promise<SetupAgentResult> {
  const startTime = Date.now();

  // ─── Load user context (if userId provided) ───

  let userContextText = "";
  if (userId) {
    try {
      const ctx = await loadUserIntegrationContext(userId);
      userContextText = formatContextForPrompt(ctx);
    } catch (err) {
      console.warn(
        `[INTEGRATION-SETUP] Failed to load user context: ${err instanceof Error ? err.message : String(err)}`
      );
      userContextText =
        "Errore nel caricamento del contesto utente. Procedi senza dati storici.";
    }
  }

  // ─── Build system prompt ───

  const systemPrompt = buildIntegrationSystemPrompt(userContextText);

  // ─── Build user prompt ───

  let contextPrefix = "";
  if (contextConnectorId) {
    contextPrefix = `CONTESTO: L'utente sta configurando il connettore "${contextConnectorId}".\n\n`;
  }

  const userPrompt =
    contextPrefix +
    formatConversationHistory(conversationHistory, userMessage);

  // ─── First pass: call claude -p (with SDK fallback) ───

  // Try CLI first, then fall back to SDK tier system if CLI is unavailable
  let cliSucceeded = false;
  let cliStdout = "";

  try {
    const cliResult = spawnClaude(systemPrompt, userPrompt);

    if (cliResult.exitCode !== 0) {
      // Check for known error patterns
      const stderr = cliResult.stderr.toLowerCase();
      const isNotFound =
        stderr.includes("enoent") || stderr.includes("not found") || stderr.includes("is not recognized");
      const isCredits =
        stderr.includes("credit") || stderr.includes("balance");
      const isRateLimit =
        stderr.includes("rate limit") || stderr.includes("rate_limit");
      const isTimeout = stderr.includes("timed out") || stderr.includes("timeout");

      if (isNotFound || isCredits || isRateLimit) {
        // CLI is unavailable or exhausted — fall back to SDK tier system
        console.warn(
          `[INTEGRATION-SETUP] CLI unavailable (${isNotFound ? "ENOENT" : isCredits ? "credits" : "rate-limit"}) → falling back to SDK tier system`
        );
      } else if (isTimeout) {
        // Timeout is a transient issue, still try SDK fallback
        console.warn(
          `[INTEGRATION-SETUP] CLI timed out → falling back to SDK tier system`
        );
      } else {
        console.error(
          `[INTEGRATION-SETUP] CLI error: exit=${cliResult.exitCode} stderr=${cliResult.stderr.slice(0, 500)} → falling back to SDK`
        );
      }

      // Fall through to SDK fallback below (cliSucceeded remains false)
    } else {
      cliSucceeded = true;
      cliStdout = cliResult.stdout;
    }
  } catch (cliError) {
    // CLI spawn itself threw — treat as CLI unavailable
    console.warn(
      `[INTEGRATION-SETUP] CLI spawn error: ${cliError instanceof Error ? cliError.message : String(cliError)} → falling back to SDK`
    );
    // cliSucceeded remains false
  }

  // ─── SDK fallback: use runAgent tier system when CLI fails ───
  // This uses the "integration-setup" agent config from lib/models.ts
  // which has gemini-2.5-flash as primary and groq-llama4-scout as fallback.
  // These free-tier providers work in demo environments.

  let sdkProvider = "claude-cli";

  if (!cliSucceeded) {
    try {
      console.log(
        `[INTEGRATION-SETUP] Using SDK tier system (integration-setup agent) as fallback`
      );

      const sdkResult = await runAgent<SetupParsedResponse>(
        "integration-setup",
        userPrompt,
        {
          systemPrompt,
          maxTokens: 2048,
          temperature: 0.3,
          jsonOutput: true,
        }
      );

      cliStdout = JSON.stringify(sdkResult.parsed);
      cliSucceeded = true;
      sdkProvider = `sdk-${sdkResult.usedModelKey}`;

      console.log(
        `[INTEGRATION-SETUP] SDK fallback succeeded: model=${sdkResult.usedModelKey} | ${Date.now() - startTime}ms`
      );
    } catch (sdkError) {
      const sdkErrMsg = sdkError instanceof Error ? sdkError.message : String(sdkError);
      console.error(`[INTEGRATION-SETUP] SDK fallback also failed: ${sdkErrMsg}`);

      return {
        message:
          "Mi dispiace, il servizio AI non e disponibile in questo momento. " +
          "Nessun provider e raggiungibile. Riprova tra qualche minuto.",
        action: "error",
        needsUserInput: true,
        provider: "none",
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ─── Parse and process the response (from CLI or SDK fallback) ───

  try {
    const parsed = parseAgentResponse(cliStdout);

    console.log(
      `[INTEGRATION-SETUP] action: ${parsed.action ?? "unknown"} | ` +
        `provider: ${sdkProvider} | ${Date.now() - startTime}ms`
    );

    // Validate and normalize the action field
    const action = VALID_ACTIONS.includes(parsed.action as ValidAction)
      ? (parsed.action as SetupAgentResult["action"])
      : "ask_details";

    // ─── Handle discover_entities: two-pass flow ───

    if (action === "discover_entities") {
      const targetConnectorId = parsed.connectorId ?? contextConnectorId;
      const discoveryQuery = parsed.discoveryQuery;

      if (targetConnectorId) {
        // Run local entity discovery
        const entities = discoveryQuery
          ? searchEntities(targetConnectorId, discoveryQuery)
          : discoverEntities(targetConnectorId);

        console.log(
          `[INTEGRATION-SETUP] Entity discovery: ${entities.length} entities found ` +
            `for "${targetConnectorId}" (query: "${discoveryQuery ?? "*"}")`
        );

        if (entities.length > 0) {
          // Two-pass: re-run the LLM with discovery results injected as context
          const entityContext = formatDiscoveryResults(entities);
          const secondPassPrompt =
            contextPrefix +
            formatConversationHistory(conversationHistory, userMessage) +
            "\n\n" +
            entityContext;

          try {
            // Try CLI for second pass first, then SDK fallback
            let secondPassText = "";
            let secondPassProvider = sdkProvider;

            const secondCliResult = spawnClaude(systemPrompt, secondPassPrompt);
            if (secondCliResult.exitCode === 0) {
              secondPassText = secondCliResult.stdout;
              secondPassProvider = "claude-cli";
            } else {
              // SDK fallback for second pass
              const sdkResult2 = await runAgent<SetupParsedResponse>(
                "integration-setup",
                secondPassPrompt,
                { systemPrompt, maxTokens: 2048, temperature: 0.3, jsonOutput: true }
              );
              secondPassText = JSON.stringify(sdkResult2.parsed);
              secondPassProvider = `sdk-${sdkResult2.usedModelKey}`;
            }

            const secondParsed = parseAgentResponse(secondPassText);
            const durationMs = Date.now() - startTime;

            console.log(
              `[INTEGRATION-SETUP] Second pass: action=${secondParsed.action ?? "ask_details"} | ` +
                `provider: ${secondPassProvider} | ${durationMs}ms`
            );

            return {
              message:
                secondParsed.message ??
                parsed.message ??
                "Ecco le entita disponibili.",
              action: "discover_entities",
              questions: secondParsed.questions ?? parsed.questions,
              discoveredSchema: secondParsed.discoveredSchema,
              proposedMapping: secondParsed.proposedMapping,
              connectorConfig: secondParsed.connectorConfig,
              needsUserInput: secondParsed.needsUserInput ?? true,
              discoveredEntities: entities,
              connectorId: targetConnectorId,
              provider: secondPassProvider,
              durationMs,
            };
          } catch {
            // If second pass fails, return entities with the first-pass message
            console.log(
              "[INTEGRATION-SETUP] Second pass failed -- returning entities with first-pass message"
            );
          }
        }

        // Return with entities (possibly empty) and the LLM's original message
        const durationMs = Date.now() - startTime;
        return {
          message:
            parsed.message ??
            (entities.length === 0
              ? "Non ho trovato entita corrispondenti alla tua ricerca. Prova con un termine diverso."
              : "Ecco le entita disponibili per questo connettore."),
          action: "discover_entities",
          questions: parsed.questions,
          discoveredEntities: entities,
          connectorId: targetConnectorId,
          needsUserInput: true,
          provider: sdkProvider,
          durationMs,
        };
      }

      // No connector identified -- ask the user
      const durationMs = Date.now() - startTime;
      return {
        message:
          parsed.message ??
          "Per quale connettore vuoi cercare le entita disponibili?",
        action: "ask_details",
        questions: [
          "HubSpot CRM",
          "Google Drive",
          "Fatture in Cloud",
          "Stripe",
          "Salesforce",
          "Altro (app custom)",
        ],
        needsUserInput: true,
        provider: sdkProvider,
        durationMs,
      };
    }

    // ─── Standard (non-discovery) actions ───

    const durationMs2 = Date.now() - startTime;

    return {
      message:
        parsed.message ?? "Non ho capito. Puoi ripetere la tua richiesta?",
      action,
      questions: parsed.questions,
      discoveredSchema: parsed.discoveredSchema,
      proposedMapping: parsed.proposedMapping,
      connectorConfig: parsed.connectorConfig,
      needsUserInput: parsed.needsUserInput ?? true,
      connectorId: parsed.connectorId ?? contextConnectorId,
      provider: sdkProvider,
      durationMs: durationMs2,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[INTEGRATION-SETUP] Error: ${errorMsg}`);

    return {
      message:
        "Mi dispiace, ho avuto un problema tecnico. Riprova tra qualche istante.",
      action: "error",
      needsUserInput: true,
      provider: sdkProvider,
      durationMs: Date.now() - startTime,
    };
  }
}

// ─── Discovery result formatting ───

/**
 * Format discovered entities as a context block for the LLM's second pass.
 * The agent will use this to craft a user-facing message about the entities.
 */
function formatDiscoveryResults(entities: DiscoveredEntity[]): string {
  const lines: string[] = [];
  lines.push("ENTITA DISPONIBILI (risultato della discovery):");
  lines.push(
    "Presenta queste entita all'utente in modo chiaro e conciso. Non ripetere la lista grezza, ma descrivi le piu importanti e chiedi quali vuole sincronizzare."
  );
  lines.push("");

  for (const entity of entities) {
    const coreLabel = entity.isCore ? " [PRINCIPALE]" : "";
    lines.push(
      `- ${entity.name} (${entity.id})${coreLabel}: ${entity.description} [Categoria: ${entity.category}]`
    );
  }

  return lines.join("\n");
}
