import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  // Fetch a sample to see all distinct law_source values
  // We use a trick: select with distinct via grouping
  const seen = new Set<string>();
  let offset = 0;
  while (offset < 10000) {
    const { data } = await s
      .from("legal_articles")
      .select("law_source")
      .range(offset, offset + 999)
      .order("law_source");
    if (!data || data.length === 0) break;
    for (const r of data) seen.add(r.law_source);
    offset += 1000;
    if (data.length < 1000) break;
  }
  console.log("Distinct law_source values found:");
  for (const src of [...seen].sort()) {
    console.log(`  - "${src}"`);
  }
  console.log(`\nTotal distinct: ${seen.size}`);
  console.log(`Total articles scanned: ${offset}`);
}
main();
