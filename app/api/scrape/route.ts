import { scrapeChangelog } from "@/lib/scraper";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await scrapeChangelog(2025, 2026);
    return NextResponse.json({
      success: true,
      message: `Scraped ${result.total} entries`,
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: String(e) },
      { status: 500 }
    );
  }
}
