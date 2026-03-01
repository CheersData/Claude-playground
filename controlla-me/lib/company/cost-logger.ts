/**
 * Cost Logger — Log costi reali per ogni chiamata agente.
 *
 * Calcola il costo usando inputCostPer1M / outputCostPer1M da lib/models.ts.
 * Fire-and-forget: errori loggati ma mai propagati.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { MODELS, type ModelKey } from "@/lib/models";

export interface CostLogInput {
  agentName: string;
  modelKey: ModelKey;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  usedFallback: boolean;
  sessionType?: string;
}

export async function logAgentCost(input: CostLogInput): Promise<void> {
  const model = MODELS[input.modelKey];
  const totalCost =
    (input.inputTokens / 1_000_000) * model.inputCostPer1M +
    (input.outputTokens / 1_000_000) * model.outputCostPer1M;

  const admin = createAdminClient();
  const { error } = await admin.from("agent_cost_log").insert({
    agent_name: input.agentName,
    model_key: input.modelKey,
    provider: model.provider,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    total_cost_usd: totalCost,
    duration_ms: input.durationMs,
    used_fallback: input.usedFallback,
    session_type: input.sessionType ?? null,
  });

  if (error) {
    console.error(`[COST-LOG] Errore insert: ${error.message}`);
  }
}

export async function getDailyCosts(days = 7): Promise<
  Array<{
    date: string;
    totalCost: number;
    totalCalls: number;
    byAgent: Record<string, number>;
    byProvider: Record<string, number>;
  }>
> {
  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await admin
    .from("agent_cost_log")
    .select("*")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const byDay = new Map<
    string,
    { totalCost: number; totalCalls: number; byAgent: Record<string, number>; byProvider: Record<string, number> }
  >();

  for (const row of data) {
    const date = (row.created_at as string).slice(0, 10);
    if (!byDay.has(date)) {
      byDay.set(date, { totalCost: 0, totalCalls: 0, byAgent: {}, byProvider: {} });
    }
    const day = byDay.get(date)!;
    const cost = Number(row.total_cost_usd);
    day.totalCost += cost;
    day.totalCalls++;
    day.byAgent[row.agent_name as string] = (day.byAgent[row.agent_name as string] ?? 0) + cost;
    day.byProvider[row.provider as string] = (day.byProvider[row.provider as string] ?? 0) + cost;
  }

  return Array.from(byDay.entries()).map(([date, info]) => ({
    date,
    ...info,
  }));
}

export async function getTotalSpend(days = 30): Promise<{
  total: number;
  calls: number;
  avgPerCall: number;
  byAgent: Record<string, { cost: number; calls: number }>;
  byProvider: Record<string, { cost: number; calls: number }>;
  fallbackRate: number;
}> {
  const admin = createAdminClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await admin
    .from("agent_cost_log")
    .select("*")
    .gte("created_at", since.toISOString());

  if (error || !data || data.length === 0) {
    return { total: 0, calls: 0, avgPerCall: 0, byAgent: {}, byProvider: {}, fallbackRate: 0 };
  }

  let total = 0;
  let fallbacks = 0;
  const byAgent: Record<string, { cost: number; calls: number }> = {};
  const byProvider: Record<string, { cost: number; calls: number }> = {};

  for (const row of data) {
    const cost = Number(row.total_cost_usd);
    total += cost;
    if (row.used_fallback) fallbacks++;

    const agent = row.agent_name as string;
    if (!byAgent[agent]) byAgent[agent] = { cost: 0, calls: 0 };
    byAgent[agent].cost += cost;
    byAgent[agent].calls++;

    const provider = row.provider as string;
    if (!byProvider[provider]) byProvider[provider] = { cost: 0, calls: 0 };
    byProvider[provider].cost += cost;
    byProvider[provider].calls++;
  }

  return {
    total,
    calls: data.length,
    avgPerCall: total / data.length,
    byAgent,
    byProvider,
    fallbackRate: fallbacks / data.length,
  };
}
