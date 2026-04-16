/**
 * Seed Supabase with the existing static JSON data.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed.ts
 */

import { createClient } from "@supabase/supabase-js";
import entries from "../app/data/entries.json";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log(`Seeding ${entries.length} entries...`);

  const batchSize = 100;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const { error } = await supabase
      .from("changelog_entries")
      .upsert(batch, { onConflict: "slug" });

    if (error) {
      console.error(`Batch ${i}-${i + batch.length} failed:`, error.message);
    } else {
      console.log(`  Upserted ${i + batch.length}/${entries.length}`);
    }
  }

  console.log("Done!");
}

seed();
