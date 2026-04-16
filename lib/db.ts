import entriesData from "@/app/data/entries.json";

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
}

const entries = entriesData as ChangelogEntry[];

export function getAllEntries(): ChangelogEntry[] {
  return entries;
}

export function getStats() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: entries.length,
    engReview: entries.filter((e) => e.requires_eng_review).length,
    newFeatures: entries.filter((e) => e.tags.includes("New") && !e.requires_eng_review).length,
    activeDeadlines: entries.filter((e) => e.deadline_date && e.deadline_date >= today).length,
  };
}
