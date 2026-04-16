import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "..", "shopify_changelog.db");
const BASE_URL = "https://shopify.dev";

const KNOWN_TAGS = [
  "Action Required", "Breaking API Change", "Deprecation Announcement", "New", "Update",
  "Admin GraphQL API", "Admin REST API", "Storefront GraphQL API", "Customer Account API",
  "Payments Apps API", "Tools", "Functions", "Themes", "Shopify App Store", "Apps",
  "Storefronts", "Admin Extensions", "Checkout UI", "Customer Accounts", "POS Extensions",
  "Shop Minis", "Platform", "App Bridge", "Webhook", "Agents",
];

const VALID_VERSIONS = [
  "2024-01", "2024-04", "2024-07", "2024-10",
  "2025-01", "2025-04", "2025-07", "2025-10",
  "2026-01", "2026-04", "2026-07", "2026-10",
];

const DATE_RE = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/g;
const DEADLINE_KW_RE = /(?:starting|effective|by |before|until|after|removed|sunset|deadline|must|will be|no longer|breaking|require|deprecated|shut down)/i;

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  });
  return res.text();
}

function extractSlugsAndDates(html: string): Map<string, string> {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  const dataScript = scripts.find((s) => s[1].length > 10000 && s[1].includes("streamController"));
  if (!dataScript) return new Map();

  const data = dataScript[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const slugPattern = /\/changelog\/([a-z0-9][a-z0-9-]+[a-z0-9])"/g;
  const result = new Map<string, string>();

  let match;
  while ((match = slugPattern.exec(data)) !== null) {
    const slug = match[1];
    if (slug === "feed" || slug.length < 9) continue;
    if (result.has(slug)) continue;

    const pos = match.index;
    const nearby = data.slice(Math.max(0, pos - 400), pos + 200);
    const dates = [...nearby.matchAll(/"(20\d{2}-\d{2}-\d{2})T/g)];
    const date = dates.length > 0 ? dates[dates.length - 1][1] : null;
    if (date) result.set(slug, date);
  }
  return result;
}

function extractDetail(html: string, slug: string) {
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  const dataScript = scripts.find((s) => s[1].length > 5000 && s[1].includes("streamController"));

  let title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  let tags: string[] = [];
  let summary = "";
  let deadlines: string[] = [];
  let deadlineDate: string | null = null;

  if (dataScript) {
    const data = dataScript[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    const slugIdx = data.indexOf(slug);
    if (slugIdx >= 0) {
      const context = data.slice(Math.max(0, slugIdx - 1000), slugIdx + 3000);

      // Title
      const titleMatch = context.match(/"title","([^"]+)"/);
      if (titleMatch) title = titleMatch[1];

      // Action Required
      if (context.includes('"actionRequired",true')) tags.push("Action Required");

      // Known tags
      for (const t of KNOWN_TAGS) {
        if (t !== "Action Required" && context.includes(`"${t}"`)) tags.push(t);
      }

      // Version tags
      const verMatches = [...context.matchAll(/"(20\d{2}-\d{2})"/g)];
      for (const vm of verMatches) {
        if (VALID_VERSIONS.includes(vm[1]) && !tags.includes(vm[1])) tags.push(vm[1]);
      }

      // Content body
      const contentMatches = [...context.matchAll(/"([A-Z][^"]{50,})"/g)];
      let content = "";
      for (const cm of contentMatches) {
        if (cm[1].length > 100 && cm[1].includes("\\r\\n")) {
          content = cm[1].replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
          break;
        }
      }
      if (!content && contentMatches.length > 0) {
        content = contentMatches.reduce((a, b) => (a[1].length > b[1].length ? a : b))[1];
        content = content.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
      }

      // Clean markdown links
      const cleanContent = content.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

      // Summary
      summary = cleanContent.slice(0, 300).trim();
      const lastPeriod = summary.lastIndexOf(".");
      if (lastPeriod > 50) summary = summary.slice(0, lastPeriod + 1);

      // Dates and deadlines
      const dateMatches = [...new Set(cleanContent.match(DATE_RE) || [])];
      const sentences = cleanContent.split(/[.!]\s/);
      deadlines = sentences
        .filter((s) => DEADLINE_KW_RE.test(s) && DATE_RE.test(s))
        .map((s) => s.trim().slice(0, 300));

      // Reset DATE_RE lastIndex
      DATE_RE.lastIndex = 0;

      if (dateMatches.length > 0) {
        const parsed = dateMatches
          .map((d) => {
            try {
              const date = new Date(d.replace(",", ""));
              return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
            } catch {
              return null;
            }
          })
          .filter(Boolean) as string[];
        if (parsed.length > 0) {
          deadlineDate = parsed.sort().pop()!;
        }
      }
    }
  }

  tags = [...new Set(tags)];
  return { title, tags, summary, deadlines, deadlineDate };
}

export interface ScrapeProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

export async function scrapeChangelog(
  minYear = 2025,
  maxYear = 2026,
  onProgress?: (p: ScrapeProgress) => void
) {
  const allSlugs = new Map<string, string>();

  // Phase 1: Listing pages
  for (let page = 1; page <= 20; page++) {
    const url = page > 1 ? `${BASE_URL}/changelog?page=${page}` : `${BASE_URL}/changelog`;
    onProgress?.({ phase: "listing", current: page, total: 20, message: `Fetching page ${page}...` });

    const html = await fetchPage(url);
    const slugDates = extractSlugsAndDates(html);
    if (slugDates.size === 0) break;

    let tooOld = 0;
    for (const [slug, date] of slugDates) {
      const year = parseInt(date.slice(0, 4));
      if (year < minYear) { tooOld++; continue; }
      if (year > maxYear) continue;
      if (!allSlugs.has(slug)) allSlugs.set(slug, date);
    }

    if (tooOld > slugDates.size / 2) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  // Phase 2: Detail pages
  const db = new Database(DB_PATH);
  db.exec("DROP TABLE IF EXISTS changelog_entries");
  db.exec(`
    CREATE TABLE changelog_entries (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      tags TEXT NOT NULL,
      summary TEXT,
      deadlines TEXT,
      deadline_date TEXT,
      has_action_required BOOLEAN DEFAULT 0,
      has_breaking_change BOOLEAN DEFAULT 0,
      has_deprecation BOOLEAN DEFAULT 0,
      requires_eng_review BOOLEAN DEFAULT 0,
      url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO changelog_entries
    (slug, title, date, tags, summary, deadlines, deadline_date,
     has_action_required, has_breaking_change, has_deprecation, requires_eng_review, url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const entries = [...allSlugs.entries()].sort((a, b) => b[1].localeCompare(a[1]));
  let completed = 0;

  for (const [slug, date] of entries) {
    completed++;
    onProgress?.({
      phase: "detail",
      current: completed,
      total: entries.length,
      message: `${slug.slice(0, 50)}...`,
    });

    try {
      const html = await fetchPage(`${BASE_URL}/changelog/${slug}`);
      const detail = extractDetail(html, slug);

      const hasAction = detail.tags.includes("Action Required");
      const hasBreaking = detail.tags.includes("Breaking API Change");
      const hasDeprecation = detail.tags.includes("Deprecation Announcement");

      insert.run(
        slug,
        detail.title,
        date,
        JSON.stringify(detail.tags),
        detail.summary,
        JSON.stringify(detail.deadlines),
        detail.deadlineDate,
        hasAction ? 1 : 0,
        hasBreaking ? 1 : 0,
        hasDeprecation ? 1 : 0,
        hasAction || hasBreaking || hasDeprecation ? 1 : 0,
        `${BASE_URL}/changelog/${slug}`
      );
    } catch {
      insert.run(slug, slug.replace(/-/g, " "), date, "[]", "", "[]", null, 0, 0, 0, 0, `${BASE_URL}/changelog/${slug}`);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  db.close();
  return { total: entries.length, completed };
}
