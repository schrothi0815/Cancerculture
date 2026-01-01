import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/admin";
import { logModerationAction } from "@/lib/logging/logModerationAction";

async function requireAdminOrMod() {
  const cookieStore = await cookies();
  const discordUserId = cookieStore.get("discord_user_id")?.value;

  if (!discordUserId) throw new Error("Unauthorized");

  const { data: member } = await supabaseAdmin
    .from("team_members")
    .select("role")
    .eq("discord_user_id", discordUserId)
    .single();

  if (!member || !["admin", "mod"].includes(member.role)) {
    throw new Error("Forbidden");
  }

  return { role: member.role, discordUserId };
}

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAdminOrMod();
    const { id } = await context.params;

    const { error } = await supabaseAdmin
      .from("submissions")
      .update({
        is_disqualified: false,
        disqualification_type: null,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to reinstate submission" },
        { status: 500 }
      );
    }

    await logModerationAction({
      actorRole: user.role,
      actorId: user.discordUserId,
      action: "reinstate_submission",
      targetType: "submission",
      targetId: id,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Unauthorized" },
      { status: 403 }
    );
  }
}
