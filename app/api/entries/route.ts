import { getAllEntries, getStats } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = getAllEntries();
    const stats = getStats();
    return NextResponse.json({ entries, stats });
  } catch (e) {
    return NextResponse.json(
      { error: "Database not found. Run a scrape first.", detail: String(e) },
      { status: 500 }
    );
  }
}
