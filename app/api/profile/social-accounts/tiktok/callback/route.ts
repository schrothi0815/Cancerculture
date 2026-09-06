export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { getAuthErrorCode } from "@/lib/auth/AuthError";
import { getValidatedApplicationOrigin } from "@/lib/auth/oauth/safeReturnPath";
import { requireSession } from "@/lib/auth/requireSession";
import { handleTikTokOAuthCallback, type TikTokCallbackResult } from "@/lib/socials/tiktokOAuth.server";
import { assertServerMutationAllowed } from "@/lib/writeGate.server";
import { NextResponse } from "next/server";

const RESULTS = new Set<TikTokCallbackResult>([
  "connected", "cancelled", "expired", "missing_scope", "invalid_identity",
  "conflict", "session", "unavailable", "invalid",
]);

function resultResponse(result: TikTokCallbackResult) {
  try {
    const origin = getValidatedApplicationOrigin(process.env.NEXT_PUBLIC_BASE_URL);
    const target = new URL("/settings/profile", origin);
    target.searchParams.set("social", "tiktok");
    target.searchParams.set("result", RESULTS.has(result) ? result : "unavailable");
    target.hash = "connected-social-accounts";
    const response = NextResponse.redirect(target, 303);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return Response.json({ error: "SOCIAL_TIKTOK_UNAVAILABLE" }, {
      status: 503,
      headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" },
    });
  }
}

export async function GET(request: Request) {
  try {
    assertServerMutationAllowed();
    const session = await requireSession();
    const result = await handleTikTokOAuthCallback(session.session_id, new URL(request.url).searchParams);
    return resultResponse(result);
  } catch (error) {
    return resultResponse(getAuthErrorCode(error) === "NOT_AUTHENTICATED" ? "session" : "unavailable");
  }
}
