import "server-only";
import { AuthError } from "@/lib/auth/AuthError";
import { supabaseAdmin } from "@/lib/db/admin";
import { assertServerMutationAllowed } from "@/lib/writeGate.server";
import { loadOwnSocialAccountIdentities } from "@/lib/socials/socialAccountIdentities.server";
import { loadOwnSocialAccountLinkingStatus } from "@/lib/socials/socialAccountLinkingStatus.server";
import { isTikTokOAuthConfigured } from "@/lib/socials/tiktokOAuth.server";

export type SocialAccountVisibility = Readonly<{
  profile: boolean; submissions: boolean; version: number; canEnable: boolean;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function unavailable(): never {
  throw new AuthError(503, "Social account settings are temporarily unavailable", "SOCIAL_MANAGEMENT_UNAVAILABLE");
}
function validSession(sessionId: string) {
  if (typeof sessionId !== "string" || !UUID.test(sessionId)) throw new AuthError(401, "Not authenticated", "NOT_AUTHENTICATED");
}
async function rpc(name: string, parameters: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(name, parameters);
  if (error) {
    if (error.code === "28000") throw new AuthError(401, "Not authenticated", "NOT_AUTHENTICATED");
    if (["SOCIAL_VISIBILITY_NOT_AVAILABLE", "SOCIAL_VISIBILITY_REQUEST_INVALID", "SOCIAL_IDENTITY_REQUEST_INVALID"].includes(error.message)) {
      throw new AuthError(409, "Settings changed. Refresh and try again.", "SOCIAL_VISIBILITY_CONFLICT");
    }
    unavailable();
  }
  return data as unknown;
}
export async function loadOwnSocialAccountVisibility(sessionId: string): Promise<SocialAccountVisibility> {
  validSession(sessionId);
  const data = await rpc("get_own_social_account_visibility", { p_session_id: sessionId });
  if (!data || typeof data !== "object" || Array.isArray(data)) unavailable();
  const item = data as Record<string, unknown>;
  if (Object.keys(item).length !== 4 || typeof item.profile !== "boolean" || typeof item.submissions !== "boolean" ||
    typeof item.canEnable !== "boolean" || !Number.isInteger(item.version) || Number(item.version) < 0 || Number(item.version) > 2147483647) unavailable();
  return Object.freeze({ profile: item.profile, submissions: item.submissions, version: item.version as number, canEnable: item.canEnable });
}
export async function loadOwnSocialAccountManagement(sessionId: string) {
  const [identities, visibility, linking] = await Promise.all([
    loadOwnSocialAccountIdentities(sessionId),
    loadOwnSocialAccountVisibility(sessionId),
    loadOwnSocialAccountLinkingStatus(sessionId),
  ]);
  return {
    identities,
    visibility,
    linkingUnlocked: linking.unlocked,
    providers: { tiktok: { connectAvailable: isTikTokOAuthConfigured() } },
  };
}
export async function setOwnSocialAccountVisibility(sessionId: string, input: Record<string, unknown>) {
  validSession(sessionId);
  const { scope, value, expectedVersion, requestId } = input;
  if (Object.keys(input).length !== 4 || (scope !== "profile" && scope !== "submissions") || typeof value !== "boolean" ||
    !Number.isInteger(expectedVersion) || Number(expectedVersion) < 0 || Number(expectedVersion) >= 2147483647 ||
    typeof requestId !== "string" || !UUID.test(requestId)) {
    throw new AuthError(400, "Invalid visibility change", "SOCIAL_VISIBILITY_REQUEST_INVALID");
  }
  assertServerMutationAllowed();
  const receipt = await rpc("set_own_social_account_visibility", {
    p_session_id: sessionId, p_scope: scope, p_value: value, p_expected_version: expectedVersion, p_request_id: requestId,
  });
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt) || Object.keys(receipt).length !== 1 ||
    (receipt as { version?: unknown }).version !== Number(expectedVersion) + 1) unavailable();
  // Never present a replay receipt as the current preference state.
}
