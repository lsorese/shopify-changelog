"use client";

import { useEffect, useState } from "react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Badge,
  InlineStack,
  Spinner,
  Banner,
} from "@shopify/polaris";

interface ScrapeLog {
  id: number;
  started_at: string;
  finished_at: string | null;
  total_entries: number;
  new_entries: number;
  updated_entries: number;
  errors: number;
  log: Array<{ slug: string; title: string; date: string; tags: string[] }>;
  status: string;
}

function fmtTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LogsPage() {
  const [logs, setLogs] = useState<ScrapeLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/logs")
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Page title="Scrape Logs" backAction={{ url: "/" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <Spinner size="large" />
        </div>
      </Page>
    );
  }

  return (
    <Page title="Scrape Logs" backAction={{ url: "/" }} subtitle="Raw output from each scrape run">
      <BlockStack gap="400">
        {logs.length === 0 && (
          <Banner tone="info">No scrape logs yet. Run a scrape to generate logs.</Banner>
        )}

        {logs.map((log) => (
          <Card key={log.id}>
            <BlockStack gap="300">
              <InlineStack gap="200" align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span" variant="headingSm">
                    {fmtTimestamp(log.started_at)}
                  </Text>
                  <Badge tone={log.status === "complete" ? "success" : log.status === "running" ? "attention" : "critical"}>
                    {log.status}
                  </Badge>
                </InlineStack>
                <InlineStack gap="200">
                  <Badge>{`${log.total_entries} total`}</Badge>
                  {log.new_entries > 0 && <Badge tone="success">{`${log.new_entries} new`}</Badge>}
                  {log.updated_entries > 0 && <Badge tone="info">{`${log.updated_entries} updated`}</Badge>}
                  {log.errors > 0 && <Badge tone="critical">{`${log.errors} errors`}</Badge>}
                </InlineStack>
              </InlineStack>

              {log.finished_at && (
                <Text as="p" variant="bodySm" tone="subdued">
                  {`Finished ${fmtTimestamp(log.finished_at)} · Duration: ${Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s`}
                </Text>
              )}

              {log.log && log.log.length > 0 && (
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    {`New entries added (${log.log.length}):`}
                  </Text>
                  <div
                    style={{
                      background: "var(--p-color-bg-surface-secondary)",
                      borderRadius: "var(--p-border-radius-200)",
                      padding: "var(--p-space-300)",
                      maxHeight: "400px",
                      overflow: "auto",
                      fontSize: "12px",
                      fontFamily: "var(--p-font-family-mono)",
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(log.log, null, 2)}
                  </div>
                </BlockStack>
              )}

              {(!log.log || log.log.length === 0) && log.status === "complete" && (
                <Text as="p" variant="bodySm" tone="subdued">No new entries added in this run.</Text>
              )}
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </Page>
  );
}
