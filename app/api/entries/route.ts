import { getAllEntries, getStats } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [entries, stats] = await Promise.all([getAllEntries(), getStats()]);
    return NextResponse.json({ entries, stats });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to load data.", detail: String(e) },
      { status: 500 }
    );
  }
}
