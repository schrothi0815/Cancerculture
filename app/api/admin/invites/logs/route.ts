export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/admin";

export async function GET() {
  try {
    // 🔐 Admin-Check
    const cookieStore = await cookies();
    const discordUserId =
      cookieStore.get("discord_user_id")?.value;

    if (!discordUserId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("discord_user_id", discordUserId)
      .single();

    if (!member || member.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // 📦 Invites + Nutzungen
    const { data, error } = await supabaseAdmin
      .from("admin_invites")
      .select(`
        id,
        invite_slug,
        note,
        invited_by_discord_id,
        is_active,
        created_at,
        invite_auth_logs (
          invited_discord_user_id,
          created_at
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to load invite logs" },
        { status: 500 }
      );
    }

    return NextResponse.json({ invites: data ?? [] });
  } catch {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 403 }
    );
  }
}
