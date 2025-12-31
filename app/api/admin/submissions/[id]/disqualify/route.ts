import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/admin";
import { logModerationAction } from "@/lib/logging/logModerationAction";

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

  return { role: member.role, discordUserId };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 🔐 Guard
    const user = await requireAdminOrMod();
    const { id } = await context.params;
    const {
      reasonCode,
      reasonText,
      evidence,
      disqualificationType,
    } = await req.json();

    if (
      disqualificationType !== "rule_violation" &&
      disqualificationType !== "illegal_content"
    ) {
      return NextResponse.json(
        { error: "Invalid disqualificationType" },
        { status: 400 }
      );
    }

    if (!reasonCode) {
      return NextResponse.json(
        { error: "reasonCode required" },
        { status: 400 }
      );
    }

    // 🔒 Submission disqualifizieren
    const { error } = await supabaseAdmin
      .from("submissions")
      .update({
        is_disqualified: true,
        disqualification_type: disqualificationType,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { error: "Failed to disqualify submission" },
        { status: 500 }
      );
    }

    // 🧾 Moderation Log
    await logModerationAction({
      actorRole: user.role,
      actorId: user.discordUserId,
      action: "disqualify_submission",
      targetType: "submission",
      targetId: id,
      reasonCode,
      reasonText,
      evidence: {
        ...evidence,
        disqualification_type: disqualificationType,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unauthorized" },
      { status: 403 }
    );
  }
}
