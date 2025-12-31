import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/admin";

export async function POST(req: Request) {
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

  // 📥 Form-Daten lesen
  const formData = await req.formData();
  const targetId = formData.get(
    "discord_user_id"
  ) as string;

  if (!targetId) {
    return NextResponse.json(
      { error: "Missing user id" },
      { status: 400 }
    );
  }

  // 🛑 Selbstschutz
  if (targetId === actorId) {
    return NextResponse.json(
      { error: "Cannot remove yourself" },
      { status: 400 }
    );
  }

  // 🔴 Mod entfernen
  await supabaseAdmin
    .from("team_members")
    .delete()
    .eq("discord_user_id", targetId)
    .eq("role", "mod");

  // 🔁 Zurück zur Mod-Liste
  return NextResponse.redirect(
    new URL("/admin/mods", req.url)
  );
}
