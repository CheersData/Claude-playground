/**
 * company-scheduler.ts — Scheduler CME per capacity management (ADR-010)
 *
 * Legge il task board, identifica dipartimenti idle, propone 1-2 task sensati
 * per ogni dipartimento senza lavoro attivo.
 *
 * Output: report testuale per CME. Non crea task automaticamente — CME approva.
 * Modello: Groq Llama (free tier) o Cerebras via openai-compat.ts
 *
 * Usage: npx tsx scripts/company-scheduler.ts
 */

import { execSync } from "child_process";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

// ─── Struttura task board ───

interface Task {
  id: string;
  title: string;
  dept: string;
  status: string;
  priority: string;
  description?: string;
}

// ─── Leggi board via CLI ───

function readBoard(): { byDept: Record<string, Task[]>; allOpen: Task[] } {
  try {
    const raw = execSync(
      "npx tsx scripts/company-tasks.ts list --status open",
      { encoding: "utf-8", cwd: resolve(__dirname, "..") }
    );

    // Parse basic info from CLI output
    const tasks: Task[] = [];
    const lines = raw.split("\n");
    for (const line of lines) {
      const match = line.match(/\[(open|in_progress)\]\s+(LOW|MEDIUM|HIGH|CRITICAL)\s+\|\s+(.+)/i);
      if (match) {
        const deptMatch = line.match(/dept:\s+(\S+)/);
        const idMatch = line.match(/id:\s+([a-f0-9]{8})/);
        tasks.push({
          id: idMatch?.[1] ?? "unknown",
          title: match[3].trim(),
          dept: deptMatch?.[1] ?? "unknown",
          status: match[1],
          priority: match[2],
        });
      }
    }

    const byDept: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!byDept[t.dept]) byDept[t.dept] = [];
      byDept[t.dept].push(t);
    }

    return { byDept, allOpen: tasks };
  } catch {
    return { byDept: {}, allOpen: [] };
  }
}

// ─── Dipartimenti attivi ───

const ALL_DEPTS = [
  "architecture",
  "data-engineering",
  "quality-assurance",
  "security",
  "finance",
  "operations",
  "strategy",
  "marketing",
  "ufficio-legale",
];

// ─── Contesto aziendale per il modello ───

const COMPANY_CONTEXT = `
Controlla.me è un'app di analisi legale AI (contratti) con 4 agenti: Classifier, Analyzer, Investigator, Advisor.
Stack: Next.js 15, Supabase, Claude/Gemini/Groq, vector DB pgvector.
Fase attuale: pre-lancio commerciale PMI. Priorità: EU AI Act compliance, DPA provider AI, qualità corpus legislativo, test coverage.

Dipartimenti attivi: Architecture, Data Engineering, Quality Assurance, Security, Finance, Operations, Strategy, Marketing, Ufficio Legale.

Backlog noto:
- QA: gap test su agent-runner.ts, tiers.ts, generate.ts
- Security: DPA con Anthropic/Mistral/Google, rimozione DeepSeek da tier Partner
- Architecture: UI scoring multidimensionale (legalCompliance, contractBalance, industryPractice)
- Data Engineering: Statuto dei Lavoratori (L. 300/1970) — fonte non ancora caricata
- Strategy: Opportunity Brief verticale HR
- Marketing: SEO articoli legali, landing page verticale affitti
- Finance: Cost report mensile marzo 2026
- Operations: Health check agenti runtime, monitoring
- Ufficio Legale: Revisione prompt advisor per limitare falsi positivi needsLawyer
`;

// ─── Genera suggerimenti con modello free ───

async function generateSuggestions(idleDepts: string[]): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;

  const apiKey = groqKey || cerebrasKey || mistralKey;
  const baseUrl = groqKey
    ? "https://api.groq.com/openai/v1"
    : cerebrasKey
    ? "https://api.cerebras.ai/v1"
    : "https://api.mistral.ai/v1";
  const model = groqKey
    ? "llama-3.3-70b-versatile"
    : cerebrasKey
    ? "llama-3.3-70b"
    : "mistral-small-latest";

  if (!apiKey) {
    return idleDepts
      .map((d) => `[${d}] Nessuna API key free disponibile — suggerimento manuale richiesto.`)
      .join("\n");
  }

  const prompt = `${COMPANY_CONTEXT}

I seguenti dipartimenti sono IDLE (nessun task aperto):
${idleDepts.join(", ")}

Per ciascuno proponi 1-2 task concreti e utili per Controlla.me in questo momento.
Formato:

## [NOME_DIPARTIMENTO]
- **Task**: titolo breve (max 10 parole)
  **Perché**: motivazione in 1 frase
  **Priorità**: LOW/MEDIUM/HIGH

Sii specifico. No task generici. Basati sul backlog noto.`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0]?.message?.content ?? "Nessuna risposta dal modello.";
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    // Fallback: suggerimenti statici
    return idleDepts
      .map((d) => `[${d}] Errore API (${errMsg}) — controlla backlog manualmente.`)
      .join("\n");
  }
}

// ─── MAIN ───

async function main() {
  console.log("=== CME Scheduler — Capacity Management ===\n");
  console.log(`Data: ${new Date().toISOString().split("T")[0]}\n`);

  const { byDept, allOpen } = readBoard();

  console.log(`Task aperti totali: ${allOpen.length}\n`);

  // Identifica dipartimenti idle
  const activeDepts = new Set(Object.keys(byDept));
  const idleDepts = ALL_DEPTS.filter((d) => !activeDepts.has(d));
  const busyDepts = ALL_DEPTS.filter((d) => activeDepts.has(d));

  if (busyDepts.length > 0) {
    console.log("Dipartimenti con lavoro attivo:");
    for (const d of busyDepts) {
      console.log(`  ${d}: ${byDept[d].length} task (${byDept[d].map((t) => t.priority).join(", ")})`);
    }
    console.log();
  }

  if (idleDepts.length === 0) {
    console.log("✓ Tutti i dipartimenti hanno lavoro. Nessuna azione necessaria.\n");
    return;
  }

  console.log(`Dipartimenti IDLE (${idleDepts.length}):`);
  for (const d of idleDepts) {
    console.log(`  - ${d}`);
  }
  console.log();

  console.log("Generazione suggerimenti...\n");
  const suggestions = await generateSuggestions(idleDepts);

  console.log("=== SUGGERIMENTI CME ===\n");
  console.log(suggestions);
  console.log("\n=== FINE SCHEDULER ===");
  console.log("\nNota: questi sono suggerimenti. CME approva prima di creare i task.");
}

main().catch(console.error);
