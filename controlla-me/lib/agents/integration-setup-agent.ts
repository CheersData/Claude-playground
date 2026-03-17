/**
 * Integration Setup Agent — agente conversazionale per la configurazione
 * di nuovi connettori dati.
 *
 * Guida l'utente attraverso:
 *   1. Identificazione della sorgente dati
 *   2. Scoperta dello schema
 *   3. Proposta di field mapping
 *   4. Configurazione autenticazione
 *   5. Generazione config connettore
 *
 * Usa runAgent("integration-setup") con catena di fallback dal tier system.
 */

import { runAgent } from "../ai-sdk/agent-runner";
import { parseAgentJSON } from "../anthropic";
import { INTEGRATION_SETUP_SYSTEM_PROMPT } from "../prompts/integration-setup";

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
    | "test_connection"
    | "propose_mapping"
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
}

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
      }
    }
    parts.push("");
  }

  parts.push(`MESSAGGIO UTENTE:\n${userMessage}`);

  return parts.join("\n");
}

// ─── Main ───

/**
 * Esegue un turno dell'agente di setup integrazione.
 *
 * @param conversationHistory - Cronologia della conversazione precedente
 * @param userMessage - Ultimo messaggio dell'utente
 * @returns Risposta strutturata dell'agente
 */
export async function runSetupAgent(
  conversationHistory: SetupAgentMessage[],
  userMessage: string
): Promise<SetupAgentResult> {
  const startTime = Date.now();

  const prompt = formatConversationHistory(conversationHistory, userMessage);

  try {
    const result = await runAgent<SetupParsedResponse>(
      "integration-setup",
      prompt,
      {
        systemPrompt: INTEGRATION_SETUP_SYSTEM_PROMPT,
      }
    );

    const parsed = result.parsed;
    const durationMs = Date.now() - startTime;

    console.log(
      `[INTEGRATION-SETUP] action: ${parsed.action ?? "unknown"} | ` +
        `provider: ${result.provider} | ${durationMs}ms`
    );

    // Validate and normalize the action field
    const validActions = [
      "ask_details",
      "test_connection",
      "propose_mapping",
      "confirm_setup",
      "error",
    ] as const;
    const action = validActions.includes(
      parsed.action as (typeof validActions)[number]
    )
      ? (parsed.action as SetupAgentResult["action"])
      : "ask_details";

    return {
      message:
        parsed.message ?? "Non ho capito. Puoi ripetere la tua richiesta?",
      action,
      questions: parsed.questions,
      discoveredSchema: parsed.discoveredSchema,
      proposedMapping: parsed.proposedMapping,
      connectorConfig: parsed.connectorConfig,
      needsUserInput: parsed.needsUserInput ?? true,
      provider: result.provider,
      durationMs,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[INTEGRATION-SETUP] Error: ${errorMsg}`);

    return {
      message:
        "Mi dispiace, ho avuto un problema tecnico. Riprova tra qualche istante.",
      action: "error",
      needsUserInput: true,
      provider: "none",
      durationMs: Date.now() - startTime,
    };
  }
}
