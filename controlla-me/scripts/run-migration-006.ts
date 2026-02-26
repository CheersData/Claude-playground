/**
 * Esegue la migration 006_connector_sync_log.sql su Supabase.
 * Usa il Supabase client con service_role per eseguire DDL via rpc.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richiesti");
    process.exit(1);
  }

  // Leggi il file SQL
  const sqlPath = path.resolve(__dirname, "../supabase/migrations/006_connector_sync_log.sql");
  const sql = fs.readFileSync(sqlPath, "utf-8");

  console.log("Esecuzione migration 006_connector_sync_log.sql...\n");

  // Splitta le istruzioni (per eseguirle una alla volta)
  // Approccio: usa fetch diretto a Supabase PostgreSQL HTTP endpoint
  const statements = [
    // CREATE TABLE
    `create table if not exists public.connector_sync_log (
      id uuid primary key default gen_random_uuid(),
      source_id text not null,
      sync_type text not null default 'full',
      status text not null default 'running',
      phase text,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      items_fetched int default 0,
      items_inserted int default 0,
      items_updated int default 0,
      items_skipped int default 0,
      errors int default 0,
      error_details jsonb default '[]'::jsonb,
      metadata jsonb default '{}'::jsonb,
      created_at timestamptz default now()
    )`,
  ];

  // Prova ad inserire un record di test per verificare se la tabella esiste
  const testRes = await fetch(`${url}/rest/v1/connector_sync_log?select=id&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  if (testRes.ok) {
    console.log("Tabella connector_sync_log esiste gia.");
  } else {
    console.log(`Tabella non trovata (${testRes.status}). Devi eseguire la migration manualmente.`);
    console.log("\nApri Supabase SQL Editor e incolla questo SQL:\n");
    console.log("─".repeat(60));
    console.log(sql);
    console.log("─".repeat(60));
    console.log("\nURL Supabase SQL Editor:");
    const projectRef = url.replace("https://", "").replace(".supabase.co", "");
    console.log(`  https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    process.exit(1);
  }

  // Verifica colonna last_synced_at su legal_articles
  const colRes = await fetch(
    `${url}/rest/v1/legal_articles?select=last_synced_at&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    }
  );

  if (colRes.ok) {
    console.log("Colonna last_synced_at su legal_articles presente.");
  } else {
    console.log("\nColonna last_synced_at mancante su legal_articles.");
    console.log("Aggiungi nel SQL Editor:");
    console.log("  ALTER TABLE public.legal_articles ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;");
  }

  console.log("\nMigration check completato.");
}

main();
