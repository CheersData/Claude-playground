/**
 * COLLABORAZIONE Layer 5 -- Iteration Loop Pattern
 *
 * Structured generate-evaluate-refine loop for iterative tasks:
 * - Backtest optimization: maxIterations=10, evaluator=(r) => r.sharpe > 1.0
 * - Prompt tuning: maxIterations=5, evaluator=(r) => r.accuracy > 0.95
 * - Grid search: maxIterations=96, evaluator=(r) => r.sharpe > 1.0
 *
 * Usage:
 *   const result = await runIterationLoop({
 *     taskId: parentTaskId,
 *     maxIterations: 10,
 *     department: 'trading',
 *     evaluator: (r) => (r as { sharpe: number }).sharpe > 1.0,
 *     onIteration: (i, result, converged) => {
 *       if (converged) return null; // stop
 *       return { sl_atr: 1.5 + i * 0.1 }; // next params
 *     },
 *     initialParams: { sl_atr: 1.5, tp_atr: 6.0 },
 *   });
 *
 * Creates REAL tasks in company_tasks for each iteration (auditable).
 *
 * See ADR-forma-mentis.md Layer 5, Section 5.3 for design rationale.
 */

import { createTask, updateTask, getTask } from "../tasks";
import type { IterationLoopConfig, IterationRecord, IterationResult } from "./types";

/**
 * Run an iteration loop: generate-evaluate-refine.
 *
 * For each iteration:
 * 1. Creates a subtask under the parent task
 * 2. Calls onIteration to get the work done and receive the result
 * 3. Evaluates the result against the success criterion
 * 4. If converged or maxIterations reached, stops
 * 5. Otherwise, gets next params from onIteration and continues
 *
 * @returns IterationResult with all iteration records and convergence info
 */
export async function runIterationLoop(
  config: IterationLoopConfig
): Promise<IterationResult> {
  const createdBy = config.createdBy ?? "cme";
  const titlePrefix = config.titlePrefix ?? "Iteration";
  const totalStart = Date.now();

  // Validate parent task exists
  const parentTask = await getTask(config.taskId);
  if (!parentTask) {
    throw new Error(
      `[COLLABORAZIONE] Parent task ${config.taskId} not found`
    );
  }

  const iterations: IterationRecord[] = [];
  let currentParams = { ...config.initialParams };
  let converged = false;
  let bestIteration = 1;
  let bestResult: unknown = null;

  for (let i = 1; i <= config.maxIterations; i++) {
    const iterStart = Date.now();

    // 1. Create iteration subtask
    const iterTask = await createIterationTask(
      config.taskId,
      i,
      config.maxIterations,
      titlePrefix,
      config.department,
      currentParams,
      createdBy,
      config.routing
    );

    // 2. Run the iteration via onIteration callback
    // The caller is responsible for doing the actual work in onIteration.
    // The callback receives the iteration number, and returns the result.
    // We call it with iteration=i, result=currentParams (as initial "result" for first call),
    // and converged=false.
    let iterResult: unknown;
    try {
      // For the first iteration, we pass initialParams as the "previous result"
      const previousResult =
        iterations.length > 0
          ? iterations[iterations.length - 1].result
          : currentParams;

      const nextParamsOrNull = await config.onIteration(
        i,
        previousResult,
        false
      );

      // The onIteration return value IS the result of this iteration.
      // This is the key insight: the caller does the work inside onIteration,
      // and the return value tells us the result + next params.
      iterResult = nextParamsOrNull;
    } catch (err) {
      // Iteration failed -- record it and stop
      const errorMsg =
        err instanceof Error ? err.message : String(err);

      await updateTask(iterTask.id, {
        status: "blocked",
        resultSummary: `Iteration ${i} failed: ${errorMsg}`,
        resultData: {
          iteration: i,
          params: currentParams,
          error: errorMsg,
        },
      });

      iterations.push({
        number: i,
        taskId: iterTask.id,
        params: currentParams,
        result: null,
        meetsSuccessCriterion: false,
        durationMs: Date.now() - iterStart,
      });

      console.log(
        `[COLLABORAZIONE] Iteration ${i}/${config.maxIterations} failed: ${errorMsg}`
      );
      break;
    }

    // 3. Evaluate the result
    let meetsSuccessCriterion = false;
    try {
      meetsSuccessCriterion = await config.evaluator(iterResult, i);
    } catch {
      // Evaluator crashed -- treat as not converged
      meetsSuccessCriterion = false;
    }

    // Track best result (last iteration that met the criterion, or the latest)
    if (meetsSuccessCriterion || iterations.length === 0) {
      bestResult = iterResult;
      bestIteration = i;
    }

    // 4. Record the iteration
    const iterRecord: IterationRecord = {
      number: i,
      taskId: iterTask.id,
      params: currentParams,
      result: iterResult,
      meetsSuccessCriterion,
      durationMs: Date.now() - iterStart,
    };
    iterations.push(iterRecord);

    // 5. Update the iteration task as done
    await updateTask(iterTask.id, {
      status: "done",
      resultSummary: `Iteration ${i}: ${meetsSuccessCriterion ? "CONVERGED" : "not converged"}`,
      resultData: {
        iteration: i,
        params: currentParams,
        result: iterResult,
        meetsSuccessCriterion,
        durationMs: iterRecord.durationMs,
      },
    });

    console.log(
      `[COLLABORAZIONE] Iteration ${i}/${config.maxIterations}: ` +
        `${meetsSuccessCriterion ? "CONVERGED" : "not converged"} (${iterRecord.durationMs}ms)`
    );

    // 6. Check convergence
    if (meetsSuccessCriterion) {
      converged = true;
      break;
    }

    // 7. Get next params from onIteration
    if (i < config.maxIterations) {
      try {
        const nextParams = await config.onIteration(i, iterResult, false);
        if (nextParams === null) {
          // Caller requested early stop
          console.log(
            `[COLLABORAZIONE] Iteration loop stopped early by onIteration at iteration ${i}`
          );
          break;
        }
        currentParams = nextParams;
      } catch {
        // onIteration for next params failed -- stop
        break;
      }
    }
  }

  const totalDurationMs = Date.now() - totalStart;

  // Update parent task with final results
  await updateTask(config.taskId, {
    resultData: {
      iterationLoop: true,
      converged,
      totalIterations: iterations.length,
      bestIteration,
      bestResult,
      iterations: iterations.map((it) => ({
        number: it.number,
        taskId: it.taskId,
        meetsSuccessCriterion: it.meetsSuccessCriterion,
        durationMs: it.durationMs,
      })),
    },
    resultSummary: converged
      ? `Converged at iteration ${bestIteration}/${config.maxIterations} (${totalDurationMs}ms)`
      : `Did not converge after ${iterations.length} iterations (${totalDurationMs}ms)`,
    status: converged ? "done" : undefined,
  });

  return {
    iterations,
    finalResult: bestResult,
    converged,
    totalIterations: iterations.length,
    totalDurationMs,
    bestIteration,
  };
}

/**
 * Create a task for one iteration of the loop.
 * The task is a child of the parent task, assigned to the target department.
 */
export async function createIterationTask(
  parentTaskId: string,
  iteration: number,
  maxIterations: number,
  titlePrefix: string,
  department: IterationLoopConfig["department"],
  params: Record<string, unknown>,
  createdBy: string,
  routing?: string
) {
  return createTask({
    title: `[${titlePrefix} ${iteration}/${maxIterations}]`,
    description: `Iteration ${iteration} of ${maxIterations}.\n\nParameters:\n\`\`\`json\n${JSON.stringify(params, null, 2)}\n\`\`\``,
    department,
    priority: "medium",
    createdBy,
    parentTaskId,
    routing,
    routingExempt: !routing,
    routingReason: routing
      ? undefined
      : "Iteration subtask -- auto-created by collaborazione layer",
    labels: ["iteration-loop"],
    tags: [`iteration-${iteration}`],
  });
}

/**
 * Evaluate a single iteration result against criteria.
 * This is a convenience wrapper that can be used standalone.
 *
 * @param result - The result to evaluate
 * @param criteria - A function that returns true if the result meets the criterion
 * @returns Whether the result meets the criterion
 */
export async function evaluateIteration(
  result: unknown,
  criteria: (result: unknown) => boolean | Promise<boolean>
): Promise<boolean> {
  try {
    return await criteria(result);
  } catch {
    return false;
  }
}
