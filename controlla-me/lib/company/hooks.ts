/**
 * Company Hooks — Trigger automatici che creano task.
 *
 * Fire-and-forget: errori loggati ma mai propagati.
 * Chiamato dall'orchestrator dopo ogni analisi completata.
 */

import { createTask } from "./tasks";

interface AnalysisHookInput {
  sessionId: string;
  usedFallback: boolean;
  totalCostUsd: number;
  agentName: string;
  durationMs: number;
}

/**
 * Hook post-analisi: crea task automatici basati sul risultato.
 */
export async function onAnalysisComplete(input: AnalysisHookInput): Promise<void> {
  // Agent used fallback → task per Architecture
  if (input.usedFallback) {
    await createTask({
      title: `Investigate fallback: ${input.agentName} used fallback model`,
      department: "architecture",
      priority: "low",
      createdBy: "hook-system",
      description: `Session ${input.sessionId}: agent ${input.agentName} fell back to secondary model. Verify primary model availability.`,
      labels: ["auto", "fallback"],
    }).catch((err) =>
      console.error(`[HOOKS] Failed to create fallback task: ${err.message}`)
    );
  }

  // Cost > $0.10 → alert per Finance
  if (input.totalCostUsd > 0.10) {
    await createTask({
      title: `Cost alert: ${input.agentName} cost $${input.totalCostUsd.toFixed(4)}`,
      department: "finance",
      priority: "medium",
      createdBy: "hook-system",
      description: `Session ${input.sessionId}: single call cost exceeded $0.10 threshold.`,
      labels: ["auto", "cost-alert"],
    }).catch((err) =>
      console.error(`[HOOKS] Failed to create cost alert task: ${err.message}`)
    );
  }
}

/**
 * Hook pipeline completata: crea task "done" per tracking.
 */
export async function onPipelineComplete(input: {
  sessionId: string;
  totalDurationMs: number;
  phasesCompleted: string[];
}): Promise<void> {
  await createTask({
    title: `Analysis completed: ${input.phasesCompleted.length} phases in ${(input.totalDurationMs / 1000).toFixed(1)}s`,
    department: "ufficio-legale",
    priority: "low",
    createdBy: "hook-system",
    description: `Session ${input.sessionId}. Phases: ${input.phasesCompleted.join(", ")}.`,
    labels: ["auto", "completed"],
  }).catch((err) =>
    console.error(`[HOOKS] Failed to create completion task: ${err.message}`)
  );
}
