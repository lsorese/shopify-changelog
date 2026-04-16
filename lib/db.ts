import { supabase } from "./supabase";

export interface ChangelogEntry {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  summary: string;
  deadlines: string[];
  deadline_date: string | null;
  has_action_required: boolean;
  has_breaking_change: boolean;
  has_deprecation: boolean;
  requires_eng_review: boolean;
  url: string;
  created_at?: string;
  updated_at?: string;
}

export async function getAllEntries(): Promise<ChangelogEntry[]> {
  const { data, error } = await supabase
    .from("changelog_entries")
    .select("*")
    .order("date", { ascending: false });

  if (error) throw error;
  return data as ChangelogEntry[];
}

export async function getStats() {
  const { count: total } = await supabase
    .from("changelog_entries")
    .select("*", { count: "exact", head: true });

  const { count: engReview } = await supabase
    .from("changelog_entries")
    .select("*", { count: "exact", head: true })
    .eq("requires_eng_review", true);

  const { count: newFeatures } = await supabase
    .from("changelog_entries")
    .select("*", { count: "exact", head: true })
    .filter("tags", "cs", '["New"]')
    .eq("requires_eng_review", false);

  const today = new Date().toISOString().slice(0, 10);
  const { count: activeDeadlines } = await supabase
    .from("changelog_entries")
    .select("*", { count: "exact", head: true })
    .not("deadline_date", "is", null)
    .gte("deadline_date", today);

  return {
    total: total ?? 0,
    engReview: engReview ?? 0,
    newFeatures: newFeatures ?? 0,
    activeDeadlines: activeDeadlines ?? 0,
  };
}

export async function upsertEntries(entries: Omit<ChangelogEntry, "created_at" | "updated_at">[]) {
  // Supabase upsert in batches of 100
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const { error } = await supabase
      .from("changelog_entries")
      .upsert(batch, { onConflict: "slug" });

    if (error) throw error;
    inserted += batch.length;
  }

  return inserted;
}
