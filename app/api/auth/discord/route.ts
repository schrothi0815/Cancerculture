import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // 🔁 Ziel nach Login (Invite, Upload, Vote, etc.)
  const redirectPath =
    searchParams.get("redirect") || "/upload";

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: process.env.DISCORD_REDIRECT_URI!,
    response_type: "code",
    scope: "identify",
    state: redirectPath, // 🔑 DAS FEHLTE
  });

  return NextResponse.redirect(
    `https://discord.com/oauth2/authorize?${params.toString()}`
  );
}
