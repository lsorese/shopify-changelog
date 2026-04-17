"use client";

import { useState } from "react";

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: Array<{ type: string; text: string }>;
}

function mrkdwnToText(mrkdwn: string): string {
  // Strip Slack mrkdwn to plain text for copying
  return mrkdwn
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2 ($1)") // <url|label> → label (url)
    .replace(/\*([^*]+)\*/g, "$1")                // bold
    .replace(/_([^_]+)_/g, "$1")                   // italic
    .replace(/:[a-z_]+:/g, "")                     // emoji codes
    .replace(/  +/g, " ")
    .trim();
}

function mrkdwnToHtml(mrkdwn: string): string {
  return mrkdwn
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Restore Slack links: &lt;url|label&gt; → <a>
    .replace(/&lt;([^|&]+)\|([^&]+)&gt;/g, '<a href="$1" target="_blank" style="color:#1264a3;text-decoration:none">$2</a>')
    .replace(/\*([^*]+)\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/:[a-z_]+:/g, (m) => emojiMap[m] || m)
    .replace(/\n/g, "<br>");
}

const emojiMap: Record<string, string> = {
  ":red_circle:": "🔴",
  ":large_orange_circle:": "🟠",
  ":large_green_circle:": "🟢",
  ":eyes:": "👀",
  ":gear:": "⚙️",
  ":memo:": "📝",
  ":alarm_clock:": "⏰",
  ":rotating_light:": "🚨",
  ":warning:": "⚠️",
  ":pushpin:": "📌",
  ":relieved:": "😌",
};

function blocksToPlainText(blocks: SlackBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.type === "divider") {
      lines.push("---");
    } else if (block.type === "section" && block.text) {
      lines.push(mrkdwnToText(block.text.text));
    } else if (block.type === "context" && block.elements) {
      lines.push(block.elements.map((el) => mrkdwnToText(el.text)).join(" "));
    }
  }
  return lines.join("\n");
}

export default function SlackPreview({
  blocks,
  summary,
  newCount,
}: {
  blocks: SlackBlock[];
  summary: string;
  newCount: number;
}) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const handleCopy = async () => {
    const text = blocksToPlainText(blocks);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(blocks, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", padding: "0 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Slack Digest Preview</h1>
          <p style={{ margin: "4px 0 0", color: "#666", fontSize: 14 }}>
            {summary} — {newCount} entries will be marked as notified on send
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowRaw(!showRaw)}
            style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 13 }}
          >
            {showRaw ? "Preview" : "Raw JSON"}
          </button>
          <button
            onClick={showRaw ? handleCopyJson : handleCopy}
            style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: copied ? "#2e7d32" : "#1264a3", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {showRaw ? (
        <pre style={{ background: "#1e1e1e", color: "#d4d4d4", padding: 20, borderRadius: 8, overflow: "auto", fontSize: 12, lineHeight: 1.5 }}>
          {JSON.stringify(blocks, null, 2)}
        </pre>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, overflow: "hidden" }}>
          {/* Fake Slack chrome */}
          <div style={{ background: "#f8f8f8", borderBottom: "1px solid #e0e0e0", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 4, background: "#4a154b", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>S</div>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Shopify Changelog</span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {blocks.map((block, i) => (
              <SlackBlockRender key={i} block={block} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SlackBlockRender({ block }: { block: SlackBlock }) {
  if (block.type === "divider") {
    return <hr style={{ border: "none", borderTop: "1px solid #e8e8e8", margin: "12px 0" }} />;
  }

  if (block.type === "section" && block.text) {
    return (
      <div
        style={{ margin: "8px 0", fontSize: 14, lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: mrkdwnToHtml(block.text.text) }}
      />
    );
  }

  if (block.type === "context" && block.elements) {
    return (
      <div style={{ margin: "8px 0" }}>
        {block.elements.map((el, i) => (
          <div
            key={i}
            style={{ fontSize: 12, color: "#616061", lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: mrkdwnToHtml(el.text) }}
          />
        ))}
      </div>
    );
  }

  return null;
}
