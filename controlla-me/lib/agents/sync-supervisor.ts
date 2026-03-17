/**
 * Sync Supervisor Agent — genera commenti in tempo reale durante
 * le operazioni di sincronizzazione dei connettori.
 *
 * Viene chiamato ad ogni cambio di stage della sync pipeline per
 * fornire all'utente un feedback comprensibile su cosa sta succedendo.
 *
 * Usa runAgent("sync-supervisor") con catena di fallback dal tier system.
 */

import { runAgent } from "../ai-sdk/agent-runner";
import { SYNC_SUPERVISOR_SYSTEM_PROMPT } from "../prompts/sync-supervisor";

// ─── Types ───

export interface SyncSupervisorEvent {
  message: string;
  stage:
    | "connecting"
    | "fetching"
    | "mapping"
    | "analyzing"
    | "done"
    | "error";
  detail?: string;
  suggestion?: string;
  severity: "info" | "warning" | "error";
  progress?: number; // 0-100
  recordsProcessed?: number;
  recordsTotal?: number;
}

export interface SyncSupervisorContext {
  connectorName: string;
  connectorType: string;
  recordsFetched?: number;
  recordsMapped?: number;
  errors?: string[];
  mappingIssues?: Array<{ field: string; confidence: number }>;
  duration?: number;
}

// ─── Parsed response type (from LLM) ───

interface SupervisorParsedResponse {
  message?: string;
  stage?: string;
  detail?: string;
  suggestion?: string;
  severity?: string;
}

// ─── Prompt building ───

/**
 * Builds the user prompt with sync context for the LLM.
 */
function buildSupervisorPrompt(
  stage: string,
  context: SyncSupervisorContext
): string {
  const parts: string[] = [];

  parts.push(`STAGE CORRENTE: ${stage}`);
  parts.push(`CONNETTORE: ${context.connectorName} (${context.connectorType})`);

  if (context.recordsFetched !== undefined) {
    parts.push(`RECORD SCARICATI: ${context.recordsFetched}`);
  }
  if (context.recordsMapped !== undefined) {
    parts.push(`RECORD MAPPATI: ${context.recordsMapped}`);
  }
  if (context.duration !== undefined) {
    parts.push(
      `TEMPO TRASCORSO: ${(context.duration / 1000).toFixed(1)} secondi`
    );
  }

  if (context.errors && context.errors.length > 0) {
    parts.push(`ERRORI (${context.errors.length}):`);
    for (const error of context.errors.slice(0, 5)) {
      parts.push(`  - ${error}`);
    }
    if (context.errors.length > 5) {
      parts.push(`  ... e altri ${context.errors.length - 5} errori`);
    }
  }

  if (context.mappingIssues && context.mappingIssues.length > 0) {
    parts.push(`PROBLEMI MAPPING (${context.mappingIssues.length}):`);
    for (const issue of context.mappingIssues.slice(0, 5)) {
      parts.push(
        `  - Campo "${issue.field}": confidenza ${(issue.confidence * 100).toFixed(0)}%`
      );
    }
  }

  parts.push(
    "\nGenera un commento appropriato per l'utente basandoti sul contesto sopra."
  );

  return parts.join("\n");
}

// ─── Main ───

/**
 * Genera un commento del supervisore per lo stage corrente della sync.
 *
 * @param stage - Stage corrente della pipeline sync
 * @param context - Contesto dell'operazione (connettore, record, errori, ecc.)
 * @returns Evento supervisore con messaggio, stage, severity e dettagli
 */
export async function generateSupervisorComment(
  stage: string,
  context: SyncSupervisorContext
): Promise<SyncSupervisorEvent> {
  const prompt = buildSupervisorPrompt(stage, context);

  try {
    const result = await runAgent<SupervisorParsedResponse>(
      "sync-supervisor",
      prompt,
      {
        systemPrompt: SYNC_SUPERVISOR_SYSTEM_PROMPT,
        maxTokens: 1024,
      }
    );

    const parsed = result.parsed;

    // Validate stage
    const validStages = [
      "connecting",
      "fetching",
      "mapping",
      "analyzing",
      "done",
      "error",
    ] as const;
    const resultStage = validStages.includes(
      parsed.stage as (typeof validStages)[number]
    )
      ? (parsed.stage as SyncSupervisorEvent["stage"])
      : (stage as SyncSupervisorEvent["stage"]);

    // Validate severity
    const validSeverities = ["info", "warning", "error"] as const;
    const severity = validSeverities.includes(
      parsed.severity as (typeof validSeverities)[number]
    )
      ? (parsed.severity as SyncSupervisorEvent["severity"])
      : "info";

    return {
      message: parsed.message ?? `Operazione ${stage} in corso...`,
      stage: resultStage,
      detail: parsed.detail,
      suggestion: parsed.suggestion,
      severity,
    };
  } catch (err) {
    // On LLM failure, return a sensible default comment rather than failing
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[SYNC-SUPERVISOR] LLM call failed: ${errorMsg}`);

    return generateFallbackComment(stage, context);
  }
}

// ─── Fallback comments (no LLM needed) ───

/**
 * Generates a fallback comment when the LLM is unavailable.
 * These are static, pre-written messages that cover the basic stages.
 */
function generateFallbackComment(
  stage: string,
  context: SyncSupervisorContext
): SyncSupervisorEvent {
  const name = context.connectorName;

  switch (stage) {
    case "connecting":
      return {
        message: `Connessione a ${name} in corso...`,
        stage: "connecting",
        severity: "info",
      };
    case "fetching":
      return {
        message: context.recordsFetched
          ? `Scaricati ${context.recordsFetched} record da ${name}.`
          : `Download record da ${name} in corso...`,
        stage: "fetching",
        severity: "info",
      };
    case "mapping":
      return {
        message: context.recordsMapped
          ? `Mappatura completata: ${context.recordsMapped} record elaborati.`
          : `Normalizzazione campi in corso...`,
        stage: "mapping",
        severity:
          context.mappingIssues && context.mappingIssues.length > 0
            ? "warning"
            : "info",
      };
    case "analyzing":
      return {
        message: `Analisi dei documenti importati in corso...`,
        stage: "analyzing",
        severity: "info",
      };
    case "done":
      return {
        message: `Sincronizzazione con ${name} completata.`,
        stage: "done",
        severity: "info",
      };
    case "error":
      return {
        message: context.errors?.[0]
          ? `Errore durante la sincronizzazione: ${context.errors[0]}`
          : `Errore durante la sincronizzazione con ${name}.`,
        stage: "error",
        severity: "error",
        suggestion: "Verifica le credenziali e riprova.",
      };
    default:
      return {
        message: `Operazione in corso su ${name}...`,
        stage: "connecting",
        severity: "info",
      };
  }
}
