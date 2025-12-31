import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/admin";

/**
 * 🔐 Admin / Mod Guard
 */
async function requireAdminOrMod() {
  const cookieStore = await cookies();
  const discordUserId = cookieStore.get("discord_user_id")?.value;

  if (!discordUserId) {
    throw new Error("Unauthorized");
  }

  const { data: member, error } = await supabaseAdmin
    .from("team_members")
    .select("role")
    .eq("discord_user_id", discordUserId)
    .single();

  if (error || !member || !["admin", "mod"].includes(member.role)) {
    throw new Error("Forbidden");
  }

  return member;
}

export async function GET(req: Request) {
  try {
    // 🔐 Guard
    await requireAdminOrMod();

    const { searchParams } = new URL(req.url);
    const cycleId = searchParams.get("cycle_id");
    const limit = Number(searchParams.get("limit") ?? 50);

    let query = supabaseAdmin
      .from("submissions")
      .select(
        `
        id,
        cycle_id,
        image_url,
        is_disqualified,
        created_at,
        voting_cycles!inner(status)
        `
      )
      .eq("voting_cycles.status", "active")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cycleId) {
      query = query.eq("cycle_id", cycleId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: "Failed to load submissions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      submissions: data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unauthorized" },
      { status: 403 }
    );
  }
}
