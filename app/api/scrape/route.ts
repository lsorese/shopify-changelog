import { scrapeChangelog } from "@/lib/scraper";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Simple auth — pass ?key=YOUR_CRON_SECRET or Authorization header
  const key = request.nextUrl.searchParams.get("key") || request.headers.get("authorization")?.replace("Bearer ", "");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scrapeChangelog(2025, 2026);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
