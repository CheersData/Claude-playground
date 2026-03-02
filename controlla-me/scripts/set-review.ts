import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
import { updateTask, getOpenTasks } from "../lib/company/tasks";

// Prefixes to match
const PREFIXES = process.argv.slice(2);

async function main() {
  const all = await getOpenTasks({ limit: 200 });
  for (const prefix of PREFIXES) {
    const match = all.find(t => t.id.startsWith(prefix));
    if (!match) { console.log(`✗ not found: ${prefix}`); continue; }
    const t = await updateTask(match.id, { status: "review" });
    console.log(`✓ review: [${t.id.slice(0,8)}] ${t.title}`);
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });
