import { NextResponse } from "next/server";

// Retired free-form/manual verification path. No session or database mutation.
export async function POST() {
  return NextResponse.json({ error: "Use Profile & social accounts in Settings.", code: "SOCIAL_LEGACY_RETIRED" },
    { status: 410, headers: { "Cache-Control": "no-store" } });
}
