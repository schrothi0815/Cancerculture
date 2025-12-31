import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/admin";

type TeamMember = {
  discord_user_id: string;
  role: "admin" | "mod";
};

/**
 * Holt den eingeloggten Team-Member
 * oder wirft einen Fehler mit Statuscode.
 */
export async function getTeamMember(): Promise<TeamMember> {
  const cookieStore = await cookies();
  const discordUserId = cookieStore.get("discord_user_id")?.value;

  if (!discordUserId) {
    throw { status: 401, message: "Unauthorized" };
  }

  const { data: member, error } = await supabaseAdmin
    .from("team_members")
    .select("discord_user_id, role")
    .eq("discord_user_id", discordUserId)
    .single();

  if (error || !member) {
    throw { status: 403, message: "Forbidden" };
  }

  return member;
}

/**
 * ADMIN ONLY
 */
export async function requireAdmin(): Promise<TeamMember> {
  const member = await getTeamMember();

  if (member.role !== "admin") {
    throw { status: 403, message: "Admin only" };
  }

  return member;
}

/**
 * MOD oder ADMIN
 */
export async function requireModOrAdmin(): Promise<TeamMember> {
  const member = await getTeamMember();

  if (!["admin", "mod"].includes(member.role)) {
    throw { status: 403, message: "Forbidden" };
  }

  return member;
}
