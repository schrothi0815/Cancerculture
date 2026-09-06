export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/auth/requireSession";
import { readSocialManagementRequest, socialManagementError, socialManagementJson } from "@/lib/socials/socialAccountManagement.http";
import { startTikTokOAuth } from "@/lib/socials/tiktokOAuth.server";
import { enforceRouteMutationGate } from "@/lib/writeGate.server";

export async function POST(request: Request) {
  const gate = enforceRouteMutationGate();
  if (gate) return gate;
  try {
    await readSocialManagementRequest(request, []);
    const session = await requireSession();
    return socialManagementJson(await startTikTokOAuth(session.session_id));
  } catch (error) {
    return socialManagementError(error);
  }
}
