"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Page,
  Card,
  Tabs,
  Badge,
  Text,
  InlineStack,
  BlockStack,
  Box,
  ResourceList,
  ResourceItem,
  Filters,
  ChoiceList,
  Banner,
  Spinner,
  Link,
} from "@shopify/polaris";

// --- Types ---

interface Entry {
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

interface Stats {
  total: number;
  engReview: number;
  newFeatures: number;
  activeDeadlines: number;
}

// --- Constants ---

const AREA_TAGS = [
  "Admin GraphQL API", "Admin REST API", "Storefront GraphQL API", "Functions",
  "Checkout UI", "Themes", "POS Extensions", "Webhook", "Tools", "Platform",
  "Apps", "Shopify App Store", "Customer Accounts", "Shop Minis", "App Bridge", "Storefronts",
];

// --- Helpers ---

function cleanSummary(text: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[\s*•-]+/, "")
    .replace(/\\r\\n|\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateFull(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function statusBadge(entry: Entry) {
  if (entry.has_action_required) return <Badge tone="critical">Action Required</Badge>;
  if (entry.has_breaking_change) return <Badge tone="warning">Breaking</Badge>;
  if (entry.has_deprecation) return <Badge tone="attention">Deprecation</Badge>;
  if (entry.tags.includes("New")) return <Badge tone="success">New</Badge>;
  if (entry.tags.includes("Update")) return <Badge tone="info">Update</Badge>;
  return null;
}

function areaBadges(entry: Entry, max = 2) {
  const areas = entry.tags.filter((t) => AREA_TAGS.includes(t));
  return areas.slice(0, max).map((t) => <Badge key={t}>{t}</Badge>);
}

function deadlineBadge(dateStr: string) {
  const days = daysUntil(dateStr);
  if (days < 0) return <Badge tone="critical">OVERDUE</Badge>;
  if (days === 0) return <Badge tone="critical">TODAY</Badge>;
  if (days <= 14) return <Badge tone="critical">{`${days}d left`}</Badge>;
  if (days <= 60) return <Badge tone="warning">{`${days}d left`}</Badge>;
  return <Badge tone="success">{`${days}d left`}</Badge>;
}

// --- Filter helper ---

function useSearchFilter(entries: Entry[], filterFn: (e: Entry) => boolean) {
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<string[]>([]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (!filterFn(e)) return false;
      if (areaFilter.length > 0 && !areaFilter.some((a) => e.tags.includes(a))) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.title.toLowerCase().includes(q) && !(e.summary || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, areaFilter, filterFn]);

  const handleAreaChange = useCallback((value: string[]) => setAreaFilter(value), []);
  const handleSearchChange = useCallback((value: string) => setSearch(value), []);
  const handleClearAll = useCallback(() => { setSearch(""); setAreaFilter([]); }, []);

  const areaChoices = useMemo(() => {
    const counts: Record<string, number> = {};
    entries.filter(filterFn).forEach((e) => {
      e.tags.forEach((t) => { if (AREA_TAGS.includes(t)) counts[t] = (counts[t] || 0) + 1; });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ label: `${tag} (${count})`, value: tag }));
  }, [entries, filterFn]);

  return { search, setSearch: handleSearchChange, areaFilter, setAreaFilter: handleAreaChange, filtered, areaChoices, clearAll: handleClearAll };
}

// --- Panels ---

function DeadlinesPanel({ entries }: { entries: Entry[] }) {
  const today = new Date().toISOString().slice(0, 10);

  const activeDeadlines = useMemo(
    () => entries.filter((e) => e.deadline_date && e.deadline_date >= today).sort((a, b) => a.deadline_date!.localeCompare(b.deadline_date!)),
    [entries, today]
  );

  const engFilterFn = useCallback((e: Entry) => e.requires_eng_review && (!e.deadline_date || e.deadline_date < today), [today]);
  const { search, setSearch, areaFilter, setAreaFilter, filtered: engReview, areaChoices, clearAll } = useSearchFilter(entries, engFilterFn);

  const appliedFilters = areaFilter.length > 0
    ? [{ key: "area", label: areaFilter.join(", "), onRemove: () => setAreaFilter([]) }]
    : [];

  return (
    <BlockStack gap="600">
      {/* Active Deadlines */}
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Active Deadlines</Text>
          <Text as="p" variant="bodySm" tone="subdued">Upcoming dates that require action from your team.</Text>

          {activeDeadlines.length === 0 ? (
            <Banner tone="info">No active future deadlines.</Banner>
          ) : (
            <BlockStack gap="300">
              {activeDeadlines.map((e) => {
                const detail = cleanSummary(e.deadlines[0] || e.summary);
                return (
                  <Card key={e.slug} background="bg-surface-secondary">
                    <BlockStack gap="200">
                      <InlineStack gap="200" align="start" blockAlign="center" wrap={false}>
                        <Text as="span" variant="bodySm" fontWeight="bold" tone="critical">{fmtDateFull(e.deadline_date!)}</Text>
                        {deadlineBadge(e.deadline_date!)}
                        {statusBadge(e)}
                      </InlineStack>
                      <Link url={e.url} target="_blank" removeUnderline>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{e.title}</Text>
                      </Link>
                      {detail && <Text as="p" variant="bodySm" tone="subdued">{detail.slice(0, 200)}</Text>}
                      <InlineStack gap="100">{areaBadges(e, 3)}</InlineStack>
                    </BlockStack>
                  </Card>
                );
              })}
            </BlockStack>
          )}
        </BlockStack>
      </Card>

      {/* Eng Review */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h2" variant="headingMd">Engineering Review ({engReview.length})</Text>
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">Breaking changes, deprecations, and action-required items.</Text>

          <Filters
            queryValue={search}
            queryPlaceholder="Search eng review items..."
            onQueryChange={setSearch}
            onQueryClear={() => setSearch("")}
            onClearAll={clearAll}
            filters={[
              {
                key: "area",
                label: "Area",
                filter: (
                  <ChoiceList
                    title="Area"
                    titleHidden
                    choices={areaChoices}
                    selected={areaFilter}
                    onChange={setAreaFilter}
                    allowMultiple
                  />
                ),
                shortcut: true,
              },
            ]}
            appliedFilters={appliedFilters}
          />

          <ResourceList
            items={engReview}
            renderItem={(e) => {
              const areas = e.tags.filter((t) => AREA_TAGS.includes(t));
              return (
                <ResourceItem
                  id={e.slug}
                  url={e.url}
                  accessibilityLabel={e.title}
                  onClick={() => window.open(e.url, "_blank")}
                >
                  <InlineStack gap="200" align="space-between" wrap={false}>
                    <InlineStack gap="200" align="start" blockAlign="start" wrap={false}>
                      <Box minWidth="50px">
                        <Text as="span" variant="bodySm" tone="subdued">{fmtDate(e.date)}</Text>
                      </Box>
                      <BlockStack gap="050">
                        <Text as="span" variant="bodyMd" fontWeight="medium">{e.title}</Text>
                        {areas.length > 0 && (
                          <Text as="span" variant="bodySm" tone="subdued">{areas.join(", ")}</Text>
                        )}
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="100">{statusBadge(e)}</InlineStack>
                  </InlineStack>
                </ResourceItem>
              );
            }}
          />
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function ActionRequiredPanel({ entries }: { entries: Entry[] }) {
  const filterFn = useCallback((e: Entry) => e.has_action_required, []);
  const { search, setSearch, areaFilter, setAreaFilter, filtered, areaChoices, clearAll } = useSearchFilter(entries, filterFn);

  const appliedFilters = areaFilter.length > 0
    ? [{ key: "area", label: areaFilter.join(", "), onRemove: () => setAreaFilter([]) }]
    : [];

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Action Required</Text>
        <Text as="p" variant="bodySm" tone="subdued">Changes that require your team to take action. Filter by area to find what applies.</Text>

        <Filters
          queryValue={search}
          queryPlaceholder="Search action items..."
          onQueryChange={setSearch}
          onQueryClear={() => setSearch("")}
          onClearAll={clearAll}
          filters={[
            {
              key: "area",
              label: "Area",
              filter: (
                <ChoiceList
                  title="Area"
                  titleHidden
                  choices={areaChoices}
                  selected={areaFilter}
                  onChange={setAreaFilter}
                  allowMultiple
                />
              ),
              shortcut: true,
            },
          ]}
          appliedFilters={appliedFilters}
        />

        <Text as="p" variant="bodySm" tone="subdued">{filtered.length} items</Text>

        <ResourceList
          items={filtered}
          renderItem={(e) => {
            const summary = cleanSummary(e.summary).slice(0, 140);
            const areas = e.tags.filter((t) => AREA_TAGS.includes(t));
            return (
              <ResourceItem
                id={e.slug}
                url={e.url}
                accessibilityLabel={e.title}
                onClick={() => window.open(e.url, "_blank")}
              >
                <InlineStack gap="200" align="space-between" wrap={false}>
                  <BlockStack gap="050">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodySm" tone="subdued">{fmtDate(e.date)}</Text>
                      {e.deadline_date && (
                        <Text as="span" variant="bodySm" fontWeight="bold" tone="critical">Due {fmtDateFull(e.deadline_date)}</Text>
                      )}
                      {e.has_breaking_change && <Badge tone="warning">Breaking</Badge>}
                      {e.has_deprecation && <Badge tone="attention">Deprecation</Badge>}
                    </InlineStack>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">{e.title}</Text>
                    {summary && <Text as="span" variant="bodySm" tone="subdued">{summary}</Text>}
                  </BlockStack>
                  <InlineStack gap="100">{areaBadges(e)}</InlineStack>
                </InlineStack>
              </ResourceItem>
            );
          }}
        />
      </BlockStack>
    </Card>
  );
}

function NewFeaturesPanel({ entries }: { entries: Entry[] }) {
  const filterFn = useCallback((e: Entry) => e.tags.includes("New") && !e.requires_eng_review, []);
  const { search, setSearch, areaFilter, setAreaFilter, filtered, areaChoices, clearAll } = useSearchFilter(entries, filterFn);

  const appliedFilters = areaFilter.length > 0
    ? [{ key: "area", label: areaFilter.join(", "), onRemove: () => setAreaFilter([]) }]
    : [];

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">New Features</Text>
        <Text as="p" variant="bodySm" tone="subdued">New platform capabilities that could benefit clients.</Text>

        <Filters
          queryValue={search}
          queryPlaceholder="Search features..."
          onQueryChange={setSearch}
          onQueryClear={() => setSearch("")}
          onClearAll={clearAll}
          filters={[
            {
              key: "area",
              label: "Area",
              filter: (
                <ChoiceList
                  title="Area"
                  titleHidden
                  choices={areaChoices}
                  selected={areaFilter}
                  onChange={setAreaFilter}
                  allowMultiple
                />
              ),
              shortcut: true,
            },
          ]}
          appliedFilters={appliedFilters}
        />

        <Text as="p" variant="bodySm" tone="subdued">{filtered.length} features</Text>

        <ResourceList
          items={filtered}
          renderItem={(e) => {
            const summary = cleanSummary(e.summary).slice(0, 140);
            return (
              <ResourceItem
                id={e.slug}
                url={e.url}
                accessibilityLabel={e.title}
                onClick={() => window.open(e.url, "_blank")}
              >
                <InlineStack gap="200" align="space-between" wrap={false}>
                  <BlockStack gap="050">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{e.title}</Text>
                      <Text as="span" variant="bodySm" tone="subdued">{fmtDate(e.date)}</Text>
                    </InlineStack>
                    {summary && (
                      <div className="line-clamp-1">
                        <Text as="span" variant="bodySm" tone="subdued">{summary}</Text>
                      </div>
                    )}
                  </BlockStack>
                  <InlineStack gap="100">{areaBadges(e)}</InlineStack>
                </InlineStack>
              </ResourceItem>
            );
          }}
        />
      </BlockStack>
    </Card>
  );
}

function AllChangesPanel({ entries }: { entries: Entry[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [areaFilter, setAreaFilter] = useState<string[]>([]);
  const [versionFilter, setVersionFilter] = useState<string[]>([]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (search) {
        const q = search.toLowerCase();
        if (!e.title.toLowerCase().includes(q) && !(e.summary || "").toLowerCase().includes(q)) return false;
      }
      if (typeFilter.length > 0) {
        const match = typeFilter.some((tf) => {
          if (tf === "action") return e.has_action_required;
          if (tf === "breaking") return e.has_breaking_change;
          if (tf === "deprecation") return e.has_deprecation;
          if (tf === "new") return e.tags.includes("New");
          if (tf === "update") return e.tags.includes("Update");
          return false;
        });
        if (!match) return false;
      }
      if (areaFilter.length > 0 && !areaFilter.some((a) => e.tags.includes(a))) return false;
      if (versionFilter.length > 0 && !versionFilter.some((v) => e.tags.includes(v))) return false;
      return true;
    });
  }, [entries, search, typeFilter, areaFilter, versionFilter]);

  const handleClearAll = useCallback(() => {
    setSearch(""); setTypeFilter([]); setAreaFilter([]); setVersionFilter([]);
  }, []);

  const appliedFilters = [
    ...(typeFilter.length > 0 ? [{ key: "type", label: `Type: ${typeFilter.join(", ")}`, onRemove: () => setTypeFilter([]) }] : []),
    ...(areaFilter.length > 0 ? [{ key: "area", label: `Area: ${areaFilter.join(", ")}`, onRemove: () => setAreaFilter([]) }] : []),
    ...(versionFilter.length > 0 ? [{ key: "version", label: `Version: ${versionFilter.join(", ")}`, onRemove: () => setVersionFilter([]) }] : []),
  ];

  return (
    <Card>
      <BlockStack gap="400">
        <Filters
          queryValue={search}
          queryPlaceholder="Search all changes..."
          onQueryChange={setSearch}
          onQueryClear={() => setSearch("")}
          onClearAll={handleClearAll}
          filters={[
            {
              key: "type",
              label: "Type",
              filter: (
                <ChoiceList
                  title="Type"
                  titleHidden
                  choices={[
                    { label: "Action Required", value: "action" },
                    { label: "Breaking Change", value: "breaking" },
                    { label: "Deprecation", value: "deprecation" },
                    { label: "New", value: "new" },
                    { label: "Update", value: "update" },
                  ]}
                  selected={typeFilter}
                  onChange={setTypeFilter}
                  allowMultiple
                />
              ),
              shortcut: true,
            },
            {
              key: "area",
              label: "Area",
              filter: (
                <ChoiceList
                  title="Area"
                  titleHidden
                  choices={AREA_TAGS.map((t) => ({ label: t, value: t }))}
                  selected={areaFilter}
                  onChange={setAreaFilter}
                  allowMultiple
                />
              ),
              shortcut: true,
            },
            {
              key: "version",
              label: "API Version",
              filter: (
                <ChoiceList
                  title="API Version"
                  titleHidden
                  choices={["2026-07", "2026-04", "2026-01", "2025-10", "2025-07", "2025-04", "2025-01"].map((v) => ({ label: v, value: v }))}
                  selected={versionFilter}
                  onChange={setVersionFilter}
                  allowMultiple
                />
              ),
              shortcut: true,
            },
          ]}
          appliedFilters={appliedFilters}
        />

        <Text as="p" variant="bodySm" tone="subdued">{filtered.length} entries</Text>

        <ResourceList
          items={filtered}
          renderItem={(e) => {
            const summary = cleanSummary(e.summary).slice(0, 120);
            return (
              <ResourceItem
                id={e.slug}
                url={e.url}
                accessibilityLabel={e.title}
                onClick={() => window.open(e.url, "_blank")}
              >
                <InlineStack gap="300" align="space-between" wrap={false}>
                  <InlineStack gap="200" align="start" wrap={false}>
                    <Box minWidth="50px">
                      <Text as="span" variant="bodySm" tone="subdued">{fmtDate(e.date)}</Text>
                    </Box>
                    <BlockStack gap="050">
                      <InlineStack gap="100" blockAlign="center">
                        {statusBadge(e)}
                        <Text as="span" variant="bodyMd" fontWeight="medium">{e.title}</Text>
                      </InlineStack>
                      {summary && (
                        <div className="line-clamp-1">
                          <Text as="span" variant="bodySm" tone="subdued">{summary}</Text>
                        </div>
                      )}
                    </BlockStack>
                  </InlineStack>
                  <InlineStack gap="100">{areaBadges(e)}</InlineStack>
                </InlineStack>
              </ResourceItem>
            );
          }}
        />
      </BlockStack>
    </Card>
  );
}

function RecentPanel({ entries }: { entries: Entry[] }) {
  const recent = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 72);
    const cutoffStr = cutoff.toISOString();
    // Use updated_at if available (means it was added/updated recently by a scrape),
    // otherwise fall back to the entry's published date
    return entries.filter((e) => {
      const ts = (e as Entry & { updated_at?: string; created_at?: string }).updated_at
        || (e as Entry & { created_at?: string }).created_at
        || e.date + "T00:00:00Z";
      return ts >= cutoffStr;
    });
  }, [entries]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">{`Recent Changes (${recent.length})`}</Text>
        <Text as="p" variant="bodySm" tone="subdued">Entries added or updated in the last 72 hours.</Text>

        {recent.length === 0 ? (
          <Banner tone="info">No changes in the last 72 hours. Run a scrape to pull new entries.</Banner>
        ) : (
          <ResourceList
            items={recent}
            renderItem={(e) => {
              const summary = cleanSummary(e.summary).slice(0, 120);
              return (
                <ResourceItem
                  id={e.slug}
                  url={e.url}
                  accessibilityLabel={e.title}
                  onClick={() => window.open(e.url, "_blank")}
                >
                  <InlineStack gap="300" align="space-between" wrap={false}>
                    <InlineStack gap="200" align="start" wrap={false}>
                      <Box minWidth="50px">
                        <Text as="span" variant="bodySm" tone="subdued">{fmtDate(e.date)}</Text>
                      </Box>
                      <BlockStack gap="050">
                        <InlineStack gap="100" blockAlign="center">
                          {statusBadge(e)}
                          <Text as="span" variant="bodyMd" fontWeight="medium">{e.title}</Text>
                        </InlineStack>
                        {summary && (
                          <div className="line-clamp-1">
                            <Text as="span" variant="bodySm" tone="subdued">{summary}</Text>
                          </div>
                        )}
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="100">{areaBadges(e)}</InlineStack>
                  </InlineStack>
                </ResourceItem>
              );
            }}
          />
        )}
      </BlockStack>
    </Card>
  );
}

// --- Main ---

export default function Dashboard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState("");

  useEffect(() => {
    fetch("/api/entries")
      .then((r) => r.json())
      .then((data) => {
        if (data.entries) {
          setEntries(data.entries);
          setStats(data.stats);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function runScrape() {
    const key = prompt("Enter scrape key:");
    if (!key) return;
    setScraping(true);
    setScrapeMsg("Scraping... this takes ~2 minutes.");
    try {
      const res = await fetch(`/api/scrape?key=${encodeURIComponent(key)}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setScrapeMsg(`Scraped ${data.total} entries. Reloading...`);
        const r = await fetch("/api/entries");
        const d = await r.json();
        setEntries(d.entries);
        setStats(d.stats);
        setScrapeMsg("");
      } else {
        setScrapeMsg(`Error: ${data.error}`);
      }
    } catch (e) {
      setScrapeMsg(`Error: ${e}`);
    }
    setScraping(false);
  }

  const actionRequiredCount = entries.filter((e) => e.has_action_required).length;

  const recentCutoff = useMemo(() => {
    const d = new Date();
    d.setHours(d.getHours() - 72);
    return d.toISOString();
  }, []);
  const recentCount = entries.filter((e) => {
    const ts = (e as Entry & { updated_at?: string; created_at?: string }).updated_at
      || (e as Entry & { created_at?: string }).created_at
      || e.date + "T00:00:00Z";
    return ts >= recentCutoff;
  }).length;

  const deadlineCount = stats ? stats.engReview + stats.activeDeadlines : 0;
  const tabs = [
    { id: "recent", content: `Recent 72h (${recentCount})`, panelID: "recent-panel" },
    { id: "deadlines", content: `Deadlines (${deadlineCount})`, panelID: "deadlines-panel" },
    { id: "action", content: `Action Required (${actionRequiredCount})`, panelID: "action-panel" },
    { id: "features", content: `New Features (${stats?.newFeatures ?? 0})`, panelID: "features-panel" },
    { id: "all", content: `All Changes (${stats?.total ?? 0})`, panelID: "all-panel" },
  ];

  if (loading) {
    return (
      <Page>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      title="Shopify Changelog"
      subtitle={`${stats?.total ?? 0} entries · shopify.dev/changelog`}
      primaryAction={{
        content: scraping ? "Scraping..." : "Rescrape",
        onAction: runScrape,
        loading: scraping,
      }}
      secondaryActions={[
        { content: "Scrape Logs", url: "/logs" },
      ]}
    >
      <BlockStack gap="400">
        {scrapeMsg && <Banner tone="info">{scrapeMsg}</Banner>}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--p-space-300)" }}>
          {[
            { value: stats?.activeDeadlines ?? 0, label: "Active Deadlines", tone: "critical" as const },
            { value: stats?.engReview ?? 0, label: "Eng Review", tone: "caution" as const },
            { value: stats?.newFeatures ?? 0, label: "New Features", tone: "success" as const },
            { value: stats?.total ?? 0, label: "Total Changes", tone: undefined },
          ].map((s) => (
            <Card key={s.label}>
              <BlockStack gap="100">
                <Text as="p" variant="headingLg" tone={s.tone}>{s.value}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
              </BlockStack>
            </Card>
          ))}
        </div>

        {/* Tabs + Content */}
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
          <Box paddingBlockStart="400">
            {selectedTab === 0 && <RecentPanel entries={entries} />}
            {selectedTab === 1 && <DeadlinesPanel entries={entries} />}
            {selectedTab === 2 && <ActionRequiredPanel entries={entries} />}
            {selectedTab === 3 && <NewFeaturesPanel entries={entries} />}
            {selectedTab === 4 && <AllChangesPanel entries={entries} />}
          </Box>
        </Tabs>
      </BlockStack>
    </Page>
  );
}
