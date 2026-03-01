import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
import { claimTask, getOpenTasks } from "../lib/company/tasks";
async function main() {
  const tasks = await getOpenTasks({ status: "open" as any, limit: 100 });
  console.log(`Claiming ${tasks.length} tasks...`);
  for (const t of tasks) {
    await claimTask(t.id, "claude-code");
    console.log(`✓ ${t.id.slice(0,8)} [${t.priority}] ${t.title}`);
  }
  console.log("Done.");
}
main().catch(e => { console.error(e.message); process.exit(1); });
