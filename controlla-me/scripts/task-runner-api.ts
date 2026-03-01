/**
 * task-runner-api.ts — Task runner alternativo via API diretta (ADR-009)
 *
 * Per task con model_tier: "free" usa modelli Groq/Cerebras/Mistral
 * senza consumare la subscription del boss (claude -p).
 *
 * Usage: npx tsx scripts/task-runner-api.ts [--task-id <id>] [--dept <dept>]
 *
 * Differenze dal task-runner.ts:
 * - Usa fetch() diretta vs CLI claude -p
 * - Solo per task taggati model_tier: free
 * - Nessun ragionamento multi-step — prompt singolo
 */

import { execSync } from "child_process";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

// ─── Config provider free ───

function getFreeProvider(): { key: string; url: string; model: string } | null {
  if (process.env.GROQ_API_KEY) {
    return {
      key: process.env.GROQ_API_KEY,
      url: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
    };
  }
  if (process.env.CEREBRAS_API_KEY) {
    return {
      key: process.env.CEREBRAS_API_KEY,
      url: "https://api.cerebras.ai/v1",
      model: "llama-3.3-70b",
    };
  }
  if (process.env.MISTRAL_API_KEY) {
    return {
      key: process.env.MISTRAL_API_KEY,
      url: "https://api.mistral.ai/v1",
      model: "mistral-small-latest",
    };
  }
  return null;
}

// ─── Esegui task via API free ───

async function runTaskFree(taskId: string, title: string, description: string): Promise<string> {
  const provider = getFreeProvider();
  if (!provider) {
    throw new Error("Nessun provider free configurato (GROQ_API_KEY / CEREBRAS_API_KEY / MISTRAL_API_KEY)");
  }

  const prompt = `Sei un agente AI che lavora per Controlla.me (app analisi legale AI).

Task da eseguire:
TITOLO: ${title}
DESCRIZIONE: ${description}

Esegui il task e fornisci output concreto e utile. Sii diretto, no intro generiche.`;

  const res = await fetch(`${provider.url}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${provider.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2048,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${provider.url}: HTTP ${res.status} — ${err.slice(0, 200)}`);
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "Nessun output.";
}

// ─── MAIN ───

async function main() {
  const args = process.argv.slice(2);
  const taskIdArg = args[args.indexOf("--task-id") + 1];

  if (!taskIdArg) {
    console.log("Usage: npx tsx scripts/task-runner-api.ts --task-id <id>");
    console.log("\nEsegue task company via API free (Groq/Cerebras/Mistral).");
    console.log("Solo per task con model_tier: free — task complessi usare CME manualmente.");
    process.exit(1);
  }

  // Leggi task dal board
  let taskData: { title: string; description: string } | null = null;
  try {
    const raw = execSync(
      `npx tsx scripts/company-tasks.ts get ${taskIdArg}`,
      { encoding: "utf-8", cwd: resolve(__dirname, "..") }
    );
    const titleMatch = raw.match(/Task:\s+(.+)/);
    const descMatch = raw.match(/Description:\s+([\s\S]+?)(?:\n  [A-Z]|$)/);
    if (titleMatch) {
      taskData = {
        title: titleMatch[1].trim(),
        description: descMatch?.[1]?.trim() ?? "Nessuna descrizione.",
      };
    }
  } catch (e) {
    console.error("Errore lettura task:", e);
    process.exit(1);
  }

  if (!taskData) {
    console.error(`Task ${taskIdArg} non trovato.`);
    process.exit(1);
  }

  console.log(`=== Task Runner API (free tier) ===`);
  console.log(`Task: ${taskData.title}`);
  console.log(`ID: ${taskIdArg}\n`);

  try {
    const result = await runTaskFree(taskIdArg, taskData.title, taskData.description);
    console.log("=== OUTPUT ===\n");
    console.log(result);
    console.log("\n=== FINE ===");

    // Segna come completato
    execSync(
      `npx tsx scripts/company-tasks.ts done ${taskIdArg} --summary ${JSON.stringify(result.slice(0, 500))}`,
      { encoding: "utf-8", cwd: resolve(__dirname, "..") }
    );
    console.log(`\n✓ Task ${taskIdArg} segnato come completato.`);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`\n✗ Errore: ${errMsg}`);
    process.exit(1);
  }
}

main().catch(console.error);
