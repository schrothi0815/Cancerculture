export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/admin";

interface InvitePageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function InviteConsumePage({
  params,
}: InvitePageProps) {
  const { slug: inviteSlug } = await params;

  // 🔍 Invite prüfen
  const { data: invite } = await supabaseAdmin
    .from("admin_invites")
    .select("id, invite_slug, is_active")
    .eq("invite_slug", inviteSlug)
    .eq("is_active", true)
    .single();

  if (!invite) {
    return (
      <div style={{ padding: 40 }}>
        <h1>Invalid or expired invite</h1>
      </div>
    );
  }

  // 🔐 Discord Auth prüfen
  const cookieStore = await cookies();
  const discordUserId =
    cookieStore.get("discord_user_id")?.value;

  // ❗ NICHT eingeloggt → OAuth starten (mit STATE!)
  if (!discordUserId) {
    redirect(
      `/api/auth/discord/login?state=/invite/${inviteSlug}`
    );
  }

  // ✅ WICHTIG:
  // KEIN invite_auth_logs INSERT HIER
  // Logging passiert EXKLUSIV im OAuth-Callback

  return (
    <div style={{ padding: 40 }}>
      <h1>✅ Thanks!</h1>
      <p>Your Discord account has been registered.</p>
      <p>An admin will assign roles if appropriate.</p>
    </div>
  );
}
