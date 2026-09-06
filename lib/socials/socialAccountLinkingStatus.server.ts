import "server-only";

import { AuthError } from "@/lib/auth/AuthError";
import { supabaseAdmin } from "@/lib/db/admin";

export type SocialAccountLinkingStatus = Readonly<{
  eligibleCycles: number;
  requiredCycles: 5;
  unlocked: boolean;
  unlockedAt: string | null;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STATUS_KEYS = ["eligibleCycles", "requiredCycles", "unlocked", "unlockedAt"];

export async function loadOwnSocialAccountLinkingStatus(sessionId: string): Promise<SocialAccountLinkingStatus> {
  if (!UUID_PATTERN.test(sessionId)) {
    throw new AuthError(401, "Not authenticated", "NOT_AUTHENTICATED");
  }
  const { data, error } = await supabaseAdmin.rpc("get_own_social_account_linking_status", {
    p_session_id: sessionId,
  });
  if (error) {
    console.error("[SOCIAL_LINKING] status unavailable", { code: error.code });
    throw new AuthError(503, "Social account linking is temporarily unavailable", "SOCIAL_LINKING_UNAVAILABLE");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new AuthError(503, "Social account linking is temporarily unavailable", "SOCIAL_LINKING_INVALID_RESPONSE");
  }
  const item = data as Record<string, unknown>;
  if (
    Object.keys(item).length !== STATUS_KEYS.length ||
    Object.keys(item).some((key) => !STATUS_KEYS.includes(key)) ||
    typeof item.eligibleCycles !== "number" || !Number.isInteger(item.eligibleCycles) ||
    item.eligibleCycles < 0 || item.eligibleCycles > 5 || item.requiredCycles !== 5 ||
    typeof item.unlocked !== "boolean" ||
    (item.unlocked
      ? item.eligibleCycles !== 5 || typeof item.unlockedAt !== "string" || !Number.isFinite(Date.parse(item.unlockedAt))
      : item.unlockedAt !== null)
  ) {
    throw new AuthError(503, "Social account linking is temporarily unavailable", "SOCIAL_LINKING_INVALID_RESPONSE");
  }
  return Object.freeze({
    eligibleCycles: item.eligibleCycles,
    requiredCycles: 5,
    unlocked: item.unlocked,
    unlockedAt: item.unlockedAt as string | null,
  });
}
