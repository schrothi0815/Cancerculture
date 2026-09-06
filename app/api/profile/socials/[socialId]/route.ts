import { NextResponse } from "next/server";

// Retired free-form/manual verification path. No session or database mutation.
export async function PATCH() {
  return NextResponse.json({ error: "Use Profile & social accounts in Settings.", code: "SOCIAL_LEGACY_RETIRED" },
    { status: 410, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  return NextResponse.json({ error: "Use Profile & social accounts in Settings.", code: "SOCIAL_LEGACY_RETIRED" },
    { status: 410, headers: { "Cache-Control": "no-store" } });
}
