import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/admin";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const actorId =
    cookieStore.get("discord_user_id")?.value;

  if (!actorId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

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

  const formData = await req.formData();
  const inviteId = formData.get("invite_id") as string;

  if (!inviteId) {
    return NextResponse.json(
      { error: "Missing invite id" },
      { status: 400 }
    );
  }

  // 🧹 Logs löschen (optional, empfohlen)
  await supabaseAdmin
    .from("invite_auth_logs")
    .delete()
    .eq("invite_id", inviteId);

  // 🗑️ Invite löschen
  await supabaseAdmin
    .from("admin_invites")
    .delete()
    .eq("id", inviteId);

  return NextResponse.redirect(
    new URL("/admin/invites", req.url)
  );
}
