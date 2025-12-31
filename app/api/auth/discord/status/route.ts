import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies(); // 👈 wichtig
  const discordUserId = cookieStore.get("discord_user_id");

  return NextResponse.json({
    verified: Boolean(discordUserId),
  });
}