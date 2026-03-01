/**
 * reset-blocked.ts — Reimposta tutti i task "blocked" a "open".
 * Uso una-tantum per recuperare task bloccati da errori del task-runner.
 * Usage: npx tsx scripts/reset-blocked.ts
 */
import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { getOpenTasks, updateTask } from "../lib/company/tasks";

async function main() {
  const blocked = await getOpenTasks({ status: "blocked" as any, limit: 100 });
  console.log(`\nTask blocked trovati: ${blocked.length}\n`);

  for (const task of blocked) {
    await updateTask(task.id, { status: "open" });
    console.log(`  ✓ Reset → open: [${task.priority}] ${task.title} (${task.id.slice(0, 8)})`);
  }

  console.log(`\nDone. ${blocked.length} task rimessi in open.\n`);
}

main().catch((err) => {
  console.error("Errore:", err.message);
  process.exit(1);
});
