import { supabase } from "./supabase";
import type { ChangelogEntry } from "./db";
import { AREA_TAGS, AREA_TAGS_SET } from "./constants";
import { fmtDate, stripBackticks } from "./format";

const API_TAGS = new Set([
  "Admin GraphQL API", "Admin REST API", "Storefront GraphQL API",
  "Customer Account API", "Payments Apps API", "Webhook",
]);

function getAreas(e: ChangelogEntry): string {
  const areas = e.tags.filter((t) => AREA_TAGS_SET.has(t));
  return areas.length > 0 ? areas.join(", ") : "";
}

function groupByArea(entries: ChangelogEntry[]): Record<string, ChangelogEntry[]> {
  const byArea: Record<string, ChangelogEntry[]> = {};
  for (const e of entries) {
    const areas = e.tags.filter((t) => AREA_TAGS_SET.has(t));
    const key = areas[0] || "General";
    if (!byArea[key]) byArea[key] = [];
    byArea[key].push(e);
  }
  return byArea;
}

function areaBreakdown(entries: ChangelogEntry[]): string {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    const areas = e.tags.filter((t) => AREA_TAGS_SET.has(t));
    const key = areas[0] || "General";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([area, n]) => `${area} (${n})`)
    .join(" · ");
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

  // Categorize — each entry goes into the highest-priority bucket only
  const actionRequired = allEntries.filter((e) => e.has_action_required);
  const breaking = allEntries.filter(
    (e) => (e.has_breaking_change || e.has_deprecation) && !e.has_action_required
  );
  const engReview = allEntries.filter(
    (e) => e.requires_eng_review && !e.has_action_required && !e.has_breaking_change && !e.has_deprecation
  );
  const newFeatures = allEntries.filter(
    (e) => e.tags.includes("New") && !e.requires_eng_review && !e.has_action_required && !e.has_breaking_change && !e.has_deprecation
  );
  const categorized = new Set([
    ...actionRequired, ...breaking, ...engReview, ...newFeatures,
  ].map((e) => e.slug));
  // API & webhook changes not already in a higher-priority bucket
  const apiChanges = allEntries.filter(
    (e) => !categorized.has(e.slug) && e.tags.some((t) => API_TAGS.has(t))
  );
  const apiSlugs = new Set(apiChanges.map((e) => e.slug));
  const other = allEntries.filter(
    (e) => !categorized.has(e.slug) && !apiSlugs.has(e.slug)
  );

  // Also pull active deadlines (next 30 days)
  const today = new Date().toISOString().slice(0, 10);

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

  // Summary line with quick counts
  const summaryParts: string[] = [];
  if (actionRequired.length > 0) summaryParts.push(`:red_circle: ${actionRequired.length} action required`);
  if (breaking.length > 0) summaryParts.push(`:large_orange_circle: ${breaking.length} breaking/deprecated`);
  if (engReview.length > 0) summaryParts.push(`:eyes: ${engReview.length} eng review`);
  if (newFeatures.length > 0) summaryParts.push(`:large_green_circle: ${newFeatures.length} new`);
  if (apiChanges.length > 0) summaryParts.push(`:gear: ${apiChanges.length} API`);
  if (other.length > 0) summaryParts.push(`:memo: ${other.length} other`);

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `*${allEntries.length} changes* · ${fmtDate(cutoffDate)} — ${fmtDate(today)}\n${summaryParts.join(" · ")}`,
      },
    ],
  });

  // Area breakdown
  const breakdown = areaBreakdown(allEntries);
  if (breakdown) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*By area:* ${breakdown}` },
      ],
    });
  }

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
      return `${urgency} • <${e.url}|${stripBackticks(e.title)}> — *${fmtDate(e.deadline_date!)}* (${days}d) — _${getAreas(e) || "General"}_`;
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
      return `• <${e.url}|${stripBackticks(e.title)}>${deadline}${area ? ` — _${area}_` : ""}`;
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
      return `• <${e.url}|${stripBackticks(e.title)}> — _${label}${area ? ` · ${area}` : ""}_`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: breakingLines.join("\n") },
    });
    blocks.push({ type: "divider" });
  }

  // Section 4: Eng Review Required
  if (engReview.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:eyes: *Needs Eng Review* (${engReview.length})`,
      },
    });
    const engLines = engReview.map((e) => {
      const area = getAreas(e);
      return `• <${e.url}|${stripBackticks(e.title)}>${area ? ` — _${area}_` : ""}`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: engLines.join("\n") },
    });
    blocks.push({ type: "divider" });
  }

  // Section 5: New Features — grouped by area
  if (newFeatures.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:large_green_circle: *New Features — Client Opportunities* (${newFeatures.length})`,
      },
    });

    const byArea = groupByArea(newFeatures);
    const featureLines = Object.entries(byArea)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([area, items]) => {
        const links = items.map((e) => `<${e.url}|${stripBackticks(e.title)}>`).join(", ");
        return `*${area}:* ${links}`;
      });

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: featureLines.join("\n") },
    });
    blocks.push({ type: "divider" });
  }

  // Section 6: API & Webhook Changes
  if (apiChanges.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:gear: *API & Webhook Changes* (${apiChanges.length})`,
      },
    });

    const byApi = groupByArea(apiChanges);
    const apiLines = Object.entries(byApi)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([area, items]) => {
        const links = items.map((e) => `<${e.url}|${stripBackticks(e.title)}>`).join(", ");
        return `*${area}:* ${links}`;
      });

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: apiLines.join("\n") },
    });
    blocks.push({ type: "divider" });
  }

  // Section 7: Other updates — grouped by area
  if (other.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:memo: *Other Updates* (${other.length})`,
      },
    });

    const byArea = groupByArea(other);
    const otherLines = Object.entries(byArea)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([area, items]) => {
        const links = items.map((e) => `<${e.url}|${stripBackticks(e.title)}>`).join(", ");
        return `*${area}:* ${links}`;
      });

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: otherLines.join("\n") },
    });
  }

  // Footer
  blocks.push({ type: "divider" });
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
