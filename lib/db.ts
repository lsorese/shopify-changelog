import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "..", "shopify_changelog.db");

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

function getDb() {
  return new Database(DB_PATH, { readonly: true });
}

function parseRow(row: Record<string, unknown>): ChangelogEntry {
  return {
    slug: row.slug as string,
    title: row.title as string,
    date: row.date as string,
    tags: JSON.parse((row.tags as string) || "[]"),
    summary: row.summary as string,
    deadlines: JSON.parse((row.deadlines as string) || "[]"),
    deadline_date: row.deadline_date as string | null,
    has_action_required: Boolean(row.has_action_required),
    has_breaking_change: Boolean(row.has_breaking_change),
    has_deprecation: Boolean(row.has_deprecation),
    requires_eng_review: Boolean(row.requires_eng_review),
    url: row.url as string,
  };
}

export function getAllEntries(): ChangelogEntry[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM changelog_entries ORDER BY date DESC").all();
  db.close();
  return rows.map((r) => parseRow(r as Record<string, unknown>));
}

export function getStats() {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM changelog_entries").get() as { c: number }).c;
  const engReview = (db.prepare("SELECT COUNT(*) as c FROM changelog_entries WHERE requires_eng_review = 1").get() as { c: number }).c;
  const newFeatures = (db.prepare("SELECT COUNT(*) as c FROM changelog_entries WHERE tags LIKE '%\"New\"%' AND requires_eng_review = 0").get() as { c: number }).c;
  const today = new Date().toISOString().slice(0, 10);
  const activeDeadlines = (db.prepare("SELECT COUNT(*) as c FROM changelog_entries WHERE deadline_date IS NOT NULL AND deadline_date >= ?").get(today) as { c: number }).c;
  db.close();
  return { total, engReview, newFeatures, activeDeadlines };
}
