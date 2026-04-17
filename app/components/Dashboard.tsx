"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Page,
  Card,
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
  Icon,
} from "@shopify/polaris";
import {
  HomeIcon,
  CalendarIcon,
  AlertTriangleIcon,
  StarIcon,
  ListBulletedIcon,
  NoteIcon,
  RefreshIcon,
  MenuIcon,
  TextFontIcon,
  AlertDiamondIcon,
} from "@shopify/polaris-icons";
import type { ChangelogEntry } from "@/lib/db";
import { AREA_TAGS } from "@/lib/constants";
import { cleanSummary, fmtDate, fmtDateFull } from "@/lib/format";

// --- Helpers ---

function renderInlineCode(text: string): React.ReactNode {
  const parts = text.split(/(`[^`]+`)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} style={{ background: "#f1f1f1", padding: "1px 4px", borderRadius: 3, fontSize: "0.9em" }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function statusBadge(entry: ChangelogEntry) {
  if (entry.has_action_required) return <Badge tone="critical">Action Required</Badge>;
  if (entry.has_breaking_change) return <Badge tone="warning">Breaking</Badge>;
  if (entry.has_deprecation) return <Badge tone="attention">Deprecation</Badge>;
  if (entry.tags.includes("New")) return <Badge tone="success">New</Badge>;
  if (entry.tags.includes("Update")) return <Badge tone="info">Update</Badge>;
  return null;
}

function areaBadges(entry: ChangelogEntry, max = 2) {
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

// --- Shared entry row ---

function EntryRow({ entry, showSummary = true }: { entry: ChangelogEntry; showSummary?: boolean }) {
  const summary = showSummary ? cleanSummary(entry.summary).slice(0, 140) : "";
  return (
    <ResourceItem
      id={entry.slug}
      url={entry.url}
      accessibilityLabel={`${entry.title} — published ${fmtDate(entry.date)}`}
      external
    >
      <div style={{ display: "flex", gap: "12px", alignItems: "start" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "start", flex: 1, minWidth: 0 }}>
          <Box minWidth="50px">
            <Text as="span" variant="bodySm" tone="subdued">{fmtDate(entry.date)}</Text>
          </Box>
          <BlockStack gap="050">
            <InlineStack gap="100" blockAlign="center" wrap>
              {statusBadge(entry)}
              <Text as="span" variant="bodyMd" fontWeight="medium">{renderInlineCode(entry.title)}</Text>
            </InlineStack>
            {summary && (
              <div className="line-clamp-1">
                <Text as="span" variant="bodySm" tone="subdued">{renderInlineCode(summary)}</Text>
              </div>
            )}
          </BlockStack>
        </div>
        <div style={{ flexShrink: 0 }}>
          <InlineStack gap="100">{areaBadges(entry)}</InlineStack>
        </div>
      </div>
    </ResourceItem>
  );
}

// --- Filter helper ---

function useSearchFilter(entries: ChangelogEntry[], filterFn: (e: ChangelogEntry) => boolean) {
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

// --- Reusable area filter UI ---

function AreaFilterBar({
  search, onSearchChange, onSearchClear, onClearAll,
  areaFilter, areaChoices, onAreaChange, placeholder,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onSearchClear: () => void;
  onClearAll: () => void;
  areaFilter: string[];
  areaChoices: { label: string; value: string }[];
  onAreaChange: (v: string[]) => void;
  placeholder: string;
}) {
  const appliedFilters = areaFilter.length > 0
    ? [{ key: "area", label: areaFilter.join(", "), onRemove: () => onAreaChange([]) }]
    : [];

  return (
    <Filters
      queryValue={search}
      queryPlaceholder={placeholder}
      onQueryChange={onSearchChange}
      onQueryClear={onSearchClear}
      onClearAll={onClearAll}
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
              onChange={onAreaChange}
              allowMultiple
            />
          ),
          shortcut: true,
        },
      ]}
      appliedFilters={appliedFilters}
    />
  );
}

// --- Nav item ---

function NavItem({
  label, icon, count, active, onClick, tone, href,
}: {
  label: string;
  icon: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  tone?: "critical" | "caution" | "success";
  href?: string;
}) {
  const inner = (
    <>
      <div className="nav-item__icon">
        <Icon source={icon} tone={active ? undefined : "subdued"} />
      </div>
      <span className="nav-item__label">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`nav-item__count${tone ? ` nav-item__count--${tone}` : ""}`}>{count}</span>
      )}
    </>
  );

  if (href) {
    return <a href={href} className="nav-item">{inner}</a>;
  }

  return (
    <button className={`nav-item${active ? " nav-item--active" : ""}`} onClick={onClick} type="button">
      {inner}
    </button>
  );
}

// --- Panels ---

function OverviewPanel({
  entries, stats, onNavigate,
}: {
  entries: ChangelogEntry[];
  stats: Stats | null;
  onNavigate: (section: Section) => void;
}) {
  const recent = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    return entries.filter((e) => e.date >= cutoffDate);
  }, [entries]);

  const statCards: { key: keyof Stats; label: string; tone: "critical" | "caution" | "success" | undefined; section: Section }[] = [
    { key: "activeDeadlines", label: "Active Deadlines", tone: "critical", section: "deadlines" },
    { key: "engReview", label: "Eng Review (30d)", tone: "caution", section: "action" },
    { key: "newFeatures", label: "New Features (30d)", tone: "success", section: "features" },
    { key: "total", label: "Total Changes", tone: undefined, section: "all" },
  ];

  return (
    <BlockStack gap="600">
      <div
        role="region"
        aria-label="Summary statistics"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "var(--p-space-300)" }}
      >
        {statCards.map((s) => (
          <div
            key={s.label}
            role="button"
            tabIndex={0}
            aria-label={`${stats?.[s.key] ?? 0} ${s.label} — click to view`}
            onClick={() => onNavigate(s.section)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate(s.section); } }}
            style={{ cursor: "pointer" }}
          >
            <Card>
              <BlockStack gap="100">
                <Text as="p" variant="headingLg" tone={s.tone}>{stats?.[s.key] ?? 0}</Text>
                <Text as="p" variant="bodySm" tone="subdued">{s.label}</Text>
              </BlockStack>
            </Card>
          </div>
        ))}
      </div>

      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">{`Recent Changes (${recent.length})`}</Text>
          <Text as="p" variant="bodySm" tone="subdued">Entries published in the past 7 days.</Text>

          {recent.length === 0 ? (
            <Banner tone="info">No changes in the past 7 days. Run a scrape to pull new entries.</Banner>
          ) : (
            <ResourceList
              items={recent}
              renderItem={(e) => <EntryRow entry={e} />}
            />
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function DeadlinesPanel({ entries }: { entries: ChangelogEntry[] }) {
  const today = new Date().toISOString().slice(0, 10);

  const activeDeadlines = useMemo(
    () => entries.filter((e) => e.deadline_date && e.deadline_date >= today).sort((a, b) => a.deadline_date!.localeCompare(b.deadline_date!)),
    [entries, today]
  );

  const engFilterFn = useCallback((e: ChangelogEntry) => e.requires_eng_review && (!e.deadline_date || e.deadline_date < today), [today]);
  const { search, setSearch, areaFilter, setAreaFilter, filtered: engReview, areaChoices, clearAll } = useSearchFilter(entries, engFilterFn);

  return (
    <BlockStack gap="600">
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
                        <Text as="span" variant="bodyMd" fontWeight="semibold">{renderInlineCode(e.title)}</Text>
                      </Link>
                      {detail && <Text as="p" variant="bodySm" tone="subdued">{renderInlineCode(detail.slice(0, 200))}</Text>}
                      <InlineStack gap="100">{areaBadges(e, 3)}</InlineStack>
                    </BlockStack>
                  </Card>
                );
              })}
            </BlockStack>
          )}
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Engineering Review ({engReview.length})</Text>
          <Text as="p" variant="bodySm" tone="subdued">Breaking changes, deprecations, and action-required items.</Text>

          <AreaFilterBar
            search={search}
            onSearchChange={setSearch}
            onSearchClear={() => setSearch("")}
            onClearAll={clearAll}
            areaFilter={areaFilter}
            areaChoices={areaChoices}
            onAreaChange={setAreaFilter}
            placeholder="Search eng review items..."
          />

          <ResourceList
            items={engReview}
            renderItem={(e) => {
              const areas = e.tags.filter((t) => AREA_TAGS.includes(t));
              return (
                <ResourceItem
                  id={e.slug}
                  url={e.url}
                  accessibilityLabel={`${e.title} — published ${fmtDate(e.date)}`}
                  external
                >
                  <div style={{ display: "flex", gap: "8px", alignItems: "start" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "start", flex: 1, minWidth: 0 }}>
                      <Box minWidth="50px">
                        <Text as="span" variant="bodySm" tone="subdued">{fmtDate(e.date)}</Text>
                      </Box>
                      <BlockStack gap="050">
                        <Text as="span" variant="bodyMd" fontWeight="medium">{renderInlineCode(e.title)}</Text>
                        {areas.length > 0 && (
                          <Text as="span" variant="bodySm" tone="subdued">{areas.join(", ")}</Text>
                        )}
                      </BlockStack>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <InlineStack gap="100">{statusBadge(e)}</InlineStack>
                    </div>
                  </div>
                </ResourceItem>
              );
            }}
          />
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function ActionRequiredPanel({ entries }: { entries: ChangelogEntry[] }) {
  const filterFn = useCallback((e: ChangelogEntry) => e.has_action_required, []);
  const { search, setSearch, areaFilter, setAreaFilter, filtered, areaChoices, clearAll } = useSearchFilter(entries, filterFn);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Action Required</Text>
        <Text as="p" variant="bodySm" tone="subdued">Changes that require your team to take action. Filter by area to find what applies.</Text>

        <AreaFilterBar
          search={search}
          onSearchChange={setSearch}
          onSearchClear={() => setSearch("")}
          onClearAll={clearAll}
          areaFilter={areaFilter}
          areaChoices={areaChoices}
          onAreaChange={setAreaFilter}
          placeholder="Search action items..."
        />

        <ResourceList
          items={filtered}
          totalItemsCount={filtered.length}
          renderItem={(e) => {
            const summary = cleanSummary(e.summary).slice(0, 140);
            return (
              <ResourceItem
                id={e.slug}
                url={e.url}
                accessibilityLabel={`${e.title} — published ${fmtDate(e.date)}`}
                external
              >
                <div style={{ display: "flex", gap: "8px", alignItems: "start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <BlockStack gap="050">
                      <InlineStack gap="200" blockAlign="center" wrap>
                        <Text as="span" variant="bodySm" tone="subdued">{fmtDate(e.date)}</Text>
                        {e.deadline_date && (
                          <Text as="span" variant="bodySm" fontWeight="bold" tone="critical">Due {fmtDateFull(e.deadline_date)}</Text>
                        )}
                        {e.has_breaking_change && <Badge tone="warning">Breaking</Badge>}
                        {e.has_deprecation && <Badge tone="attention">Deprecation</Badge>}
                      </InlineStack>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{renderInlineCode(e.title)}</Text>
                      {summary && (
                        <div className="line-clamp-1">
                          <Text as="span" variant="bodySm" tone="subdued">{renderInlineCode(summary)}</Text>
                        </div>
                      )}
                    </BlockStack>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <InlineStack gap="100">{areaBadges(e)}</InlineStack>
                  </div>
                </div>
              </ResourceItem>
            );
          }}
        />
      </BlockStack>
    </Card>
  );
}

function DeprecationsPanel({ entries }: { entries: ChangelogEntry[] }) {
  const filterFn = useCallback((e: ChangelogEntry) => e.has_breaking_change || e.has_deprecation, []);
  const { search, setSearch, areaFilter, setAreaFilter, filtered, areaChoices, clearAll } = useSearchFilter(entries, filterFn);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">Deprecations & Breaking Changes</Text>
        <Text as="p" variant="bodySm" tone="subdued">Features being deprecated or APIs with breaking changes. Review for impact on your projects.</Text>

        <AreaFilterBar
          search={search}
          onSearchChange={setSearch}
          onSearchClear={() => setSearch("")}
          onClearAll={clearAll}
          areaFilter={areaFilter}
          areaChoices={areaChoices}
          onAreaChange={setAreaFilter}
          placeholder="Search deprecations..."
        />

        <ResourceList
          items={filtered}
          totalItemsCount={filtered.length}
          renderItem={(e) => {
            const summary = cleanSummary(e.summary).slice(0, 140);
            return (
              <ResourceItem
                id={e.slug}
                url={e.url}
                accessibilityLabel={`${e.title} — published ${fmtDate(e.date)}`}
                external
              >
                <div style={{ display: "flex", gap: "8px", alignItems: "start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <BlockStack gap="050">
                      <InlineStack gap="200" blockAlign="center" wrap>
                        <Text as="span" variant="bodySm" tone="subdued">{fmtDate(e.date)}</Text>
                        {e.deadline_date && (
                          <Text as="span" variant="bodySm" fontWeight="bold" tone="critical">Due {fmtDateFull(e.deadline_date)}</Text>
                        )}
                        {e.has_breaking_change && <Badge tone="warning">Breaking</Badge>}
                        {e.has_deprecation && <Badge tone="attention">Deprecation</Badge>}
                      </InlineStack>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">{renderInlineCode(e.title)}</Text>
                      {summary && (
                        <div className="line-clamp-1">
                          <Text as="span" variant="bodySm" tone="subdued">{renderInlineCode(summary)}</Text>
                        </div>
                      )}
                    </BlockStack>
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    <InlineStack gap="100">{areaBadges(e)}</InlineStack>
                  </div>
                </div>
              </ResourceItem>
            );
          }}
        />
      </BlockStack>
    </Card>
  );
}

function NewFeaturesPanel({ entries }: { entries: ChangelogEntry[] }) {
  const filterFn = useCallback((e: ChangelogEntry) => e.tags.includes("New") && !e.requires_eng_review, []);
  const { search, setSearch, areaFilter, setAreaFilter, filtered, areaChoices, clearAll } = useSearchFilter(entries, filterFn);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">New Features</Text>
        <Text as="p" variant="bodySm" tone="subdued">New platform capabilities that could benefit clients.</Text>

        <AreaFilterBar
          search={search}
          onSearchChange={setSearch}
          onSearchClear={() => setSearch("")}
          onClearAll={clearAll}
          areaFilter={areaFilter}
          areaChoices={areaChoices}
          onAreaChange={setAreaFilter}
          placeholder="Search features..."
        />

        <Text as="p" variant="bodySm" tone="subdued">{filtered.length} features</Text>

        <ResourceList
          items={filtered}
          renderItem={(e) => <EntryRow entry={e} />}
        />
      </BlockStack>
    </Card>
  );
}

function AllChangesPanel({ entries }: { entries: ChangelogEntry[] }) {
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
          renderItem={(e) => <EntryRow entry={e} />}
        />
      </BlockStack>
    </Card>
  );
}

// --- Types ---

interface Stats {
  total: number;
  engReview: number;
  newFeatures: number;
  activeDeadlines: number;
}

type Section = "overview" | "deadlines" | "action" | "deprecations" | "features" | "all";

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: "Overview", subtitle: "Dashboard summary and recent activity" },
  deadlines: { title: "Deadlines", subtitle: "Upcoming dates and engineering review items" },
  action: { title: "Action Required", subtitle: "Changes requiring team action" },
  deprecations: { title: "Deprecations", subtitle: "Deprecated features and breaking changes" },
  features: { title: "New Features", subtitle: "New platform capabilities" },
  all: { title: "All Changes", subtitle: "Complete changelog" },
};

// --- Main ---

export default function Dashboard() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapeMsg, setScrapeMsg] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [comicSans, setComicSans] = useState(false);

  useEffect(() => {
    setComicSans(localStorage.getItem("comicSans") === "1");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("comic-sans", comicSans);
    localStorage.setItem("comicSans", comicSans ? "1" : "0");
  }, [comicSans]);

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

  const cutoff30d = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const actionRequiredCount = useMemo(
    () => entries.filter((e) => e.has_action_required && e.date >= cutoff30d).length,
    [entries, cutoff30d]
  );
  const deprecationCount = useMemo(
    () => entries.filter((e) => (e.has_breaking_change || e.has_deprecation) && e.date >= cutoff30d).length,
    [entries, cutoff30d]
  );
  const newFeaturesCount = useMemo(
    () => entries.filter((e) => e.tags.includes("New") && !e.requires_eng_review && e.date >= cutoff30d).length,
    [entries, cutoff30d]
  );

  const recentCount = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    return entries.filter((e) => e.date >= cutoff.toISOString().slice(0, 10)).length;
  }, [entries]);

  const deadlineCount = stats ? stats.activeDeadlines : 0;
  const meta = SECTION_META[section];

  function navigateTo(s: Section) {
    setSection(s);
    setSidebarOpen(false);
  }

  return (
    <div className="app-layout">
      {/* Mobile header */}
      <div className="mobile-header">
        <button className="mobile-header__burger" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
          <Icon source={MenuIcon} />
        </button>
        <Text as="p" variant="headingMd">{meta.title}</Text>
      </div>

      {/* Sidebar overlay */}
      <div
        className={`sidebar-overlay${sidebarOpen ? " sidebar-overlay--visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? " sidebar--open" : ""}`}>
        <div className="sidebar-header">
          <Text as="p" variant="headingMd">Shopify Changelog</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            {stats ? `${stats.total} entries tracked` : "Loading..."}
          </Text>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-title">Monitor</div>
          <NavItem
            label="Overview"
            icon={HomeIcon}
            count={recentCount}
            active={section === "overview"}
            onClick={() => navigateTo("overview")}
          />
          <NavItem
            label="Deadlines"
            icon={CalendarIcon}
            count={deadlineCount}
            tone="critical"
            active={section === "deadlines"}
            onClick={() => navigateTo("deadlines")}
          />
          <NavItem
            label="Action Required"
            icon={AlertTriangleIcon}
            count={actionRequiredCount}
            tone="caution"
            active={section === "action"}
            onClick={() => navigateTo("action")}
          />
          <NavItem
            label="Deprecations"
            icon={AlertDiamondIcon}
            count={deprecationCount}
            tone="caution"
            active={section === "deprecations"}
            onClick={() => navigateTo("deprecations")}
          />

          <div style={{ padding: "4px 12px 0", opacity: 0.5 }}>
            <Text as="p" variant="bodySm" tone="subdued">Counts from last 30 days</Text>
          </div>

          <div className="sidebar-section-title">Explore</div>
          <NavItem
            label="New Features"
            icon={StarIcon}
            count={newFeaturesCount}
            tone="success"
            active={section === "features"}
            onClick={() => navigateTo("features")}
          />
          <NavItem
            label="All Changes"
            icon={ListBulletedIcon}
            count={stats?.total}
            active={section === "all"}
            onClick={() => navigateTo("all")}
          />
        </nav>

        <div style={{ flex: 1 }} />

        <nav className="sidebar-nav sidebar-footer">
          <NavItem label="Scrape Logs" icon={NoteIcon} href="/logs" />
          <NavItem
            label={scraping ? "Scraping..." : "Rescrape"}
            icon={RefreshIcon}
            onClick={runScrape}
          />
          <NavItem
            label={comicSans ? "Comic Sans: ON" : "Comic Sans"}
            icon={TextFontIcon}
            active={comicSans}
            onClick={() => setComicSans((v) => !v)}
          />
        </nav>
      </aside>

      {/* Main content */}
      <main className="main-content">
        {loading ? (
          <div role="status" aria-label="Loading dashboard" style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
            <Spinner size="large" accessibilityLabel="Loading changelog data" />
          </div>
        ) : (
          <Page title={meta.title} subtitle={meta.subtitle}>
            <BlockStack gap="400">
              {scrapeMsg && <Banner tone="info">{scrapeMsg}</Banner>}

              {section === "overview" && <OverviewPanel entries={entries} stats={stats} onNavigate={setSection} />}
              {section === "deadlines" && <DeadlinesPanel entries={entries} />}
              {section === "action" && <ActionRequiredPanel entries={entries} />}
              {section === "deprecations" && <DeprecationsPanel entries={entries} />}
              {section === "features" && <NewFeaturesPanel entries={entries} />}
              {section === "all" && <AllChangesPanel entries={entries} />}
            </BlockStack>
          </Page>
        )}
      </main>
    </div>
  );
}
