import { buildSlackDigest } from "@/lib/slack-digest";
import SlackPreview from "./SlackPreview";

export const dynamic = "force-dynamic";

export default async function SlackPage() {
  const dashboardUrl = process.env.DASHBOARD_URL || "https://shopify-changelog.vercel.app";
  const { blocks, summary, slugsToMark } = await buildSlackDigest(dashboardUrl);

  return (
    <SlackPreview
      blocks={blocks}
      summary={summary}
      newCount={slugsToMark.length}
    />
  );
}
