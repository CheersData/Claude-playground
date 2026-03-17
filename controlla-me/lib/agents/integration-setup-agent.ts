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
import { INTEGRATION_SETUP_SYSTEM_PROMPT } from "../prompts/integration-setup";
import {
  discoverEntities,
  searchEntities,
  type DiscoveredEntity,
} from "../staff/data-connector/entity-discovery";

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
 * Supports a two-pass flow for entity discovery:
 *   1. LLM returns action "discover_entities" with discoveryQuery + connectorId
 *   2. We run the discovery locally (no API needed)
 *   3. We inject the results as context and re-run the LLM to produce a user-facing message
 *
 * @param conversationHistory - Cronologia della conversazione precedente
 * @param userMessage - Ultimo messaggio dell'utente
 * @param contextConnectorId - Optional connectorId from the page context
 * @returns Risposta strutturata dell'agente
 */
export async function runSetupAgent(
  conversationHistory: SetupAgentMessage[],
  userMessage: string,
  contextConnectorId?: string
): Promise<SetupAgentResult> {
  const startTime = Date.now();

  // If a connectorId is provided from context, prepend it to the prompt
  let contextPrefix = "";
  if (contextConnectorId) {
    contextPrefix = `CONTESTO: L'utente sta configurando il connettore "${contextConnectorId}".\n\n`;
  }

  const prompt = contextPrefix + formatConversationHistory(conversationHistory, userMessage);

  try {
    const result = await runAgent<SetupParsedResponse>(
      "integration-setup",
      prompt,
      {
        systemPrompt: INTEGRATION_SETUP_SYSTEM_PROMPT,
      }
    );

    const parsed = result.parsed;

    console.log(
      `[INTEGRATION-SETUP] action: ${parsed.action ?? "unknown"} | ` +
        `provider: ${result.provider} | ${Date.now() - startTime}ms`
    );

    // Validate and normalize the action field
    const validActions = [
      "ask_details",
      "discover_entities",
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
            const secondResult = await runAgent<SetupParsedResponse>(
              "integration-setup",
              secondPassPrompt,
              {
                systemPrompt: INTEGRATION_SETUP_SYSTEM_PROMPT,
              }
            );

            const secondParsed = secondResult.parsed;
            const durationMs = Date.now() - startTime;

            console.log(
              `[INTEGRATION-SETUP] Second pass: action=${secondParsed.action ?? "ask_details"} | ` +
                `provider: ${secondResult.provider} | ${durationMs}ms`
            );

            return {
              message:
                secondParsed.message ?? parsed.message ?? "Ecco le entita disponibili.",
              action: "discover_entities",
              questions: secondParsed.questions ?? parsed.questions,
              discoveredSchema: secondParsed.discoveredSchema,
              proposedMapping: secondParsed.proposedMapping,
              connectorConfig: secondParsed.connectorConfig,
              needsUserInput: secondParsed.needsUserInput ?? true,
              discoveredEntities: entities,
              connectorId: targetConnectorId,
              provider: secondResult.provider,
              durationMs,
            };
          } catch {
            // If second pass fails, return entities with the first-pass message
            console.log("[INTEGRATION-SETUP] Second pass failed — returning entities with first-pass message");
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
          provider: result.provider,
          durationMs,
        };
      }

      // No connector identified — ask the user
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
        ],
        needsUserInput: true,
        provider: result.provider,
        durationMs,
      };
    }

    // ─── Standard (non-discovery) actions ───

    const durationMs = Date.now() - startTime;

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

// ─── Discovery result formatting ───

/**
 * Format discovered entities as a context block for the LLM's second pass.
 * The agent will use this to craft a user-facing message about the entities.
 */
function formatDiscoveryResults(entities: DiscoveredEntity[]): string {
  const lines: string[] = [];
  lines.push("ENTITA DISPONIBILI (risultato della discovery):");
  lines.push("Presenta queste entita all'utente in modo chiaro e conciso. Non ripetere la lista grezza, ma descrivi le piu importanti e chiedi quali vuole sincronizzare.");
  lines.push("");

  for (const entity of entities) {
    const coreLabel = entity.isCore ? " [PRINCIPALE]" : "";
    lines.push(
      `- ${entity.name} (${entity.id})${coreLabel}: ${entity.description} [Categoria: ${entity.category}]`
    );
  }

  return lines.join("\n");
}
