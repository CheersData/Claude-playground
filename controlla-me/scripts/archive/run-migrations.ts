/**
 * Esegue le migrazioni 008 e 009 su Supabase.
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres" npx tsx scripts/run-migrations.ts
 */

import { readFileSync } from "fs";
import { Client } from "pg";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: Imposta DATABASE_URL");
    console.error('  DATABASE_URL="postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres" npx tsx scripts/run-migrations.ts');
    process.exit(1);
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connesso al database.\n");

  const migrations = [
    "supabase/migrations/008_company_tasks.sql",
    "supabase/migrations/009_cost_tracking.sql",
  ];

  for (const file of migrations) {
    const sql = readFileSync(file, "utf-8");
    console.log(`Eseguendo ${file}...`);
    try {
      await client.query(sql);
      console.log(`  ✓ ${file} completato\n`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) {
        console.log(`  ⚠ ${file} — tabella già esiste, skip\n`);
      } else {
        console.error(`  ✗ ${file} — errore: ${msg}\n`);
        throw err;
      }
    }
  }

  // Verifica
  const { rows: tables } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('company_tasks', 'agent_cost_log')
    ORDER BY table_name
  `);
  console.log("Tabelle verificate:");
  for (const row of tables) {
    console.log(`  ✓ ${row.table_name}`);
  }

  await client.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
