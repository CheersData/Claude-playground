#!/usr/bin/env npx tsx
/**
 * db-query.ts — Accesso diretto PostgreSQL per CME
 *
 * Uso:
 *   npx tsx scripts/db-query.ts "SELECT count(*) FROM company_tasks"
 *   npx tsx scripts/db-query.ts --file supabase/migrations/044_example.sql
 *   npx tsx scripts/db-query.ts --tables                    # lista tabelle
 *   npx tsx scripts/db-query.ts --describe company_tasks    # schema tabella
 *   npx tsx scripts/db-query.ts --stats                     # statistiche DB
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERRORE: DATABASE_URL non configurata in .env.local");
  process.exit(1);
}

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const args = process.argv.slice(2);

    if (args.length === 0) {
      console.log("Uso: npx tsx scripts/db-query.ts <SQL | --tables | --describe <table> | --stats | --file <path>>");
      process.exit(0);
    }

    // --tables: lista tutte le tabelle
    if (args[0] === "--tables") {
      const res = await client.query(`
        SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      console.log("\n📋 Tabelle pubbliche:\n");
      for (const row of res.rows) {
        console.log(`  ${row.table_name.padEnd(35)} ${row.size}`);
      }
      console.log(`\nTotale: ${res.rows.length} tabelle`);
      return;
    }

    // --describe <table>: schema tabella
    if (args[0] === "--describe" && args[1]) {
      const res = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default,
               character_maximum_length
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [args[1]]);

      if (res.rows.length === 0) {
        console.log(`Tabella '${args[1]}' non trovata.`);
        return;
      }

      console.log(`\n📋 Schema: ${args[1]}\n`);
      for (const col of res.rows) {
        const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
        const type = col.character_maximum_length
          ? `${col.data_type}(${col.character_maximum_length})`
          : col.data_type;
        const def = col.column_default ? ` DEFAULT ${col.column_default.substring(0, 40)}` : "";
        console.log(`  ${col.column_name.padEnd(30)} ${type.padEnd(25)} ${nullable.padEnd(10)}${def}`);
      }
      console.log(`\nColonne: ${res.rows.length}`);
      return;
    }

    // --stats: statistiche generali DB
    if (args[0] === "--stats") {
      const dbSize = await client.query("SELECT pg_size_pretty(pg_database_size(current_database())) as size");
      const tableCount = await client.query("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'");
      const connCount = await client.query("SELECT count(*) FROM pg_stat_activity");

      // Conta righe per tabelle principali
      const mainTables = [
        "company_tasks", "legal_articles", "profiles", "analyses",
        "company_knowledge", "department_memory", "company_sessions",
        "trading_signals", "trading_orders", "portfolio_positions",
        "decision_journal", "company_goals"
      ];

      console.log("\n📊 Statistiche Database\n");
      console.log(`  Database size:     ${dbSize.rows[0].size}`);
      console.log(`  Tabelle:           ${tableCount.rows[0].count}`);
      console.log(`  Connessioni:       ${connCount.rows[0].count}`);
      console.log("\n  Righe per tabella:");

      for (const table of mainTables) {
        try {
          const res = await client.query(`SELECT count(*) FROM ${table}`);
          console.log(`    ${table.padEnd(30)} ${res.rows[0].count.toString().padStart(8)} righe`);
        } catch {
          console.log(`    ${table.padEnd(30)}     N/A`);
        }
      }
      return;
    }

    // --file <path>: esegui SQL da file
    if (args[0] === "--file" && args[1]) {
      const fs = await import("fs");
      const sql = fs.readFileSync(args[1], "utf-8");
      console.log(`\nEsecuzione: ${args[1]} (${sql.length} chars)\n`);
      const res = await client.query(sql);
      if (res.rows && res.rows.length > 0) {
        console.table(res.rows.slice(0, 50));
      }
      console.log(`\n✓ Completato. Righe affected: ${res.rowCount ?? "N/A"}`);
      return;
    }

    // Query SQL diretta
    const sql = args.join(" ");
    console.log(`\nQuery: ${sql.substring(0, 100)}${sql.length > 100 ? "..." : ""}\n`);
    const res = await client.query(sql);

    if (res.rows && res.rows.length > 0) {
      console.table(res.rows.slice(0, 100));
      if (res.rows.length > 100) {
        console.log(`... (mostrate 100/${res.rows.length} righe)`);
      }
    } else {
      console.log(`✓ Completato. Righe affected: ${res.rowCount ?? 0}`);
    }

  } catch (err: unknown) {
    const error = err as Error;
    console.error(`\n❌ Errore: ${error.message}`);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
