import { sendSlackDigest, buildSlackDigest } from "@/lib/slack-digest";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET: Vercel cron trigger
export async function GET(request: NextRequest) {
  console.log("[slack-digest] GET hit");
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error("[slack-digest] Unauthorized — auth mismatch");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return runDigest();
}

// POST: Manual trigger (with preview option)
export async function POST(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preview = request.nextUrl.searchParams.get("preview") === "true";
  const dashboardUrl = process.env.DASHBOARD_URL || "https://shopify-changelog.vercel.app";

  if (preview) {
    // Return the blocks without sending to Slack
    const { blocks, summary } = await buildSlackDigest(dashboardUrl);
    return NextResponse.json({ preview: true, summary, blocks });
  }

  return runDigest();
}

async function runDigest() {
  console.log("[slack-digest] runDigest start");
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const dashboardUrl = process.env.DASHBOARD_URL || "https://shopify-changelog.vercel.app";

  if (!webhookUrl) {
    console.error("[slack-digest] SLACK_WEBHOOK_URL missing");
    return NextResponse.json(
      { error: "SLACK_WEBHOOK_URL not configured" },
      { status: 500 }
    );
  }

  try {
    console.log("[slack-digest] calling sendSlackDigest");
    const result = await sendSlackDigest(webhookUrl, dashboardUrl);
    console.log("[slack-digest] success:", result.summary);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[slack-digest] sendSlackDigest failed:", e);
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 }
    );
  }
}
