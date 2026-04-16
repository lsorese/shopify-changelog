import { supabase } from "./supabase";
import type { ChangelogEntry } from "./db";

const AREA_TAGS = new Set([
  "Admin GraphQL API", "Admin REST API", "Storefront GraphQL API", "Customer Account API",
  "Payments Apps API", "Tools", "Functions", "Themes", "Shopify App Store", "Apps",
  "Storefronts", "Admin Extensions", "Checkout UI", "Customer Accounts", "POS Extensions",
  "Shop Minis", "Platform", "App Bridge", "Webhook", "Agents",
]);

function getAreas(e: ChangelogEntry): string {
  const areas = e.tags.filter((t) => AREA_TAGS.has(t));
  return areas.length > 0 ? areas.join(", ") : "";
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function cleanSummary(text: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\\r\\n|\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function buildSlackDigest(dashboardUrl: string) {
  // Fetch entries from last 72h by published date
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 72);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data: entries, error } = await supabase
    .from("changelog_entries")
    .select("*")
    .gte("date", cutoffDate)
    .order("date", { ascending: false });

  if (error) throw error;
  if (!entries || entries.length === 0) {
    return buildEmptyDigest(dashboardUrl);
  }

  const allEntries = entries as ChangelogEntry[];

  // Categorize
  const actionRequired = allEntries.filter((e) => e.has_action_required);
  const breaking = allEntries.filter(
    (e) => (e.has_breaking_change || e.has_deprecation) && !e.has_action_required
  );
  const newFeatures = allEntries.filter(
    (e) => e.tags.includes("New") && !e.requires_eng_review
  );
  const other = allEntries.filter(
    (e) => !e.has_action_required && !e.has_breaking_change && !e.has_deprecation && !e.tags.includes("New")
  );

  // Also pull active deadlines (next 30 days)
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDays = new Date();
  thirtyDays.setDate(thirtyDays.getDate() + 30);
  const thirtyDaysStr = thirtyDays.toISOString().slice(0, 10);

  const { data: deadlineEntries } = await supabase
    .from("changelog_entries")
    .select("*")
    .gte("deadline_date", today)
    .order("deadline_date", { ascending: true });

  const upcomingDeadlines = (deadlineEntries || []) as ChangelogEntry[];

  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "Shopify Changelog Digest", emoji: true },
  });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `${allEntries.length} changes in the last 72 hours · ${fmtDate(cutoffDate)} — ${fmtDate(today)}`,
      },
    ],
  });
  blocks.push({ type: "divider" });

  // Section 1: Upcoming Deadlines (if any within 30 days)
  if (upcomingDeadlines.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:alarm_clock: *Upcoming Deadlines* (${upcomingDeadlines.length})`,
      },
    });
    const deadlineLines = upcomingDeadlines.map((e) => {
      const days = Math.ceil(
        (new Date(e.deadline_date! + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      const urgency = days <= 7 ? ":rotating_light:" : days <= 14 ? ":warning:" : "";
      return `${urgency} • <${e.url}|${e.title}> — *${fmtDate(e.deadline_date!)}* (${days}d) — _${getAreas(e) || "General"}_`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: deadlineLines.join("\n") },
    });
    blocks.push({ type: "divider" });
  }

  // Section 2: Action Required
  if (actionRequired.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:red_circle: *Action Required* (${actionRequired.length})`,
      },
    });
    const actionLines = actionRequired.map((e) => {
      const deadline = e.deadline_date ? ` — _Due ${fmtDate(e.deadline_date)}_` : "";
      const area = getAreas(e);
      return `• <${e.url}|${e.title}>${deadline}${area ? ` — _${area}_` : ""}`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: actionLines.join("\n") },
    });
    blocks.push({ type: "divider" });
  }

  // Section 3: Breaking / Deprecations
  if (breaking.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:large_orange_circle: *Breaking Changes & Deprecations* (${breaking.length})`,
      },
    });
    const breakingLines = breaking.map((e) => {
      const label = e.has_breaking_change ? "Breaking" : "Deprecation";
      const area = getAreas(e);
      return `• <${e.url}|${e.title}> — _${label}${area ? ` · ${area}` : ""}_`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: breakingLines.join("\n") },
    });
    blocks.push({ type: "divider" });
  }

  // Section 4: New Features — grouped by area
  if (newFeatures.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:large_green_circle: *New Features — Client Opportunities* (${newFeatures.length})`,
      },
    });

    // Group by primary area
    const byArea: Record<string, ChangelogEntry[]> = {};
    for (const e of newFeatures) {
      const areas = e.tags.filter((t) => AREA_TAGS.has(t));
      const key = areas[0] || "General";
      if (!byArea[key]) byArea[key] = [];
      byArea[key].push(e);
    }

    const featureLines = Object.entries(byArea)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([area, items]) => {
        const links = items.map((e) => `<${e.url}|${e.title}>`).join(", ");
        return `*${area}:* ${links}`;
      });

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: featureLines.join("\n") },
    });
    blocks.push({ type: "divider" });
  }

  // Section 5: Other updates (just count)
  if (other.length > 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:memo: *${other.length} other updates* — <${dashboardUrl}|View all in dashboard>`,
        },
      ],
    });
  }

  // Footer
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `<${dashboardUrl}|Open Dashboard> · Next digest in 72 hours`,
      },
    ],
  });

  return { blocks, summary: `Shopify Changelog: ${allEntries.length} changes in the last 72h` };
}

function buildEmptyDigest(dashboardUrl: string) {
  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "Shopify Changelog Digest", emoji: true },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "No new Shopify changelog entries in the last 72 hours. :relieved:",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `<${dashboardUrl}|Open Dashboard> · Next digest in 72 hours`,
          },
        ],
      },
    ],
    summary: "Shopify Changelog: No new changes in the last 72h",
  };
}

export async function sendSlackDigest(webhookUrl: string, dashboardUrl: string) {
  const { blocks, summary } = await buildSlackDigest(dashboardUrl);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: summary, blocks }),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
  }

  return { ok: true, summary };
}

// Slack Block Kit types (minimal)
interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text: string }>;
}
