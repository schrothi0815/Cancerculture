export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/admin";
import { logAdminAction } from "@/lib/audit/logAdminAction";

export async function POST(req: Request) {
  try {
    // 🔐 Auth
    const cookieStore = await cookies();
    const actorId =
      cookieStore.get("discord_user_id")?.value;

    if (!actorId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 🔐 Admin-Check
    const { data: actor } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("discord_user_id", actorId)
      .single();

    if (!actor || actor.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // 📥 Input
    const { targetDiscordId, role } =
      await req.json();

    if (
      !targetDiscordId ||
      !["mod", "remove"].includes(role)
    ) {
      return NextResponse.json(
        { error: "Invalid payload" },
        { status: 400 }
      );
    }

    if (role === "mod") {
  // 🔍 Username aus Invite-Logs holen (optional!)
  const { data: inviteLog } =
    await supabaseAdmin
      .from("invite_auth_logs")
      .select("discord_username")
      .eq(
        "invited_discord_user_id",
        targetDiscordId
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  const discordUsername: string | null =
    inviteLog?.discord_username ?? null;

  // ➕ Make Mod
  await supabaseAdmin
    .from("team_members")
    .upsert({
      discord_user_id: targetDiscordId,
      discord_username: discordUsername,
      role: "mod",
    });
}

      await logAdminAction({
        actorType: "admin",
        actorId,
        action: "make_mod",
        targetType: "user",
        targetId: targetDiscordId,
      });
    

    if (role === "remove") {
      // ➖ Remove Mod
      await supabaseAdmin
        .from("team_members")
        .delete()
        .eq(
          "discord_user_id",
          targetDiscordId
        )
        .neq("role", "admin"); // Admins schützen

      await logAdminAction({
        actorType: "admin",
        actorId,
        action: "remove_mod",
        targetType: "user",
        targetId: targetDiscordId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    );
  }
}
