import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");

  // 🔑 state enthält den ursprünglichen Zielpfad
  const redirectPath =
    searchParams.get("state") || "/upload";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

if (!code) {
  return NextResponse.redirect(
    new URL(`${redirectPath}?error=discord`, baseUrl)
  );
}


  // 1️⃣ Code → Access Token
  const tokenRes = await fetch(
    "https://discord.com/api/oauth2/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret:
          process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri:
          process.env.DISCORD_REDIRECT_URI!,
      }),
    }
  );

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
  return NextResponse.redirect(
    new URL(`${redirectPath}?error=discord`, baseUrl)
  );
}


  // 2️⃣ Discord User holen
  const userRes = await fetch(
    "https://discord.com/api/users/@me",
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    }
  );

  const user = await userRes.json();

  if (!user?.id) {
  return NextResponse.redirect(
    new URL(`${redirectPath}?error=discord`, baseUrl)
  );
}


  // 🧠 3️⃣ INVITE-FLOW erkennen
  if (redirectPath.startsWith("/invite/")) {
    const inviteSlug = redirectPath.split("/invite/")[1];

    if (inviteSlug) {
      // 🔍 Invite prüfen
      const { data: invite } =
        await supabaseAdmin
          .from("admin_invites")
          .select("id, invite_slug, is_active")
          .eq("invite_slug", inviteSlug)
          .single();

      if (invite && invite.is_active) {
        // 🧾 Invite-Auth-Log (inkl. Anzeige-Daten)
        await supabaseAdmin
          .from("invite_auth_logs")
          .insert({
            invite_id: invite.id,
            invite_slug: invite.invite_slug,
            invited_discord_user_id: user.id,

            // 🆕 Anzeige-Daten
            discord_username: user.username,
            discord_discriminator:
              user.discriminator,
            discord_avatar: user.avatar,
          });
      }
    }
  }

  // 4️⃣ Cookie setzen + Redirect


const response = NextResponse.redirect(
  new URL(redirectPath, baseUrl)
);

  response.cookies.set("discord_user_id", user.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 Tage
  });

  return response;
}
