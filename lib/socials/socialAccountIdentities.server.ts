import "server-only";

import { AuthError } from "@/lib/auth/AuthError";
import { supabaseAdmin } from "@/lib/db/admin";

export type VerifiedSocialProvider = "tiktok" | "youtube" | "x" | "instagram" | "facebook";
export type PublicSocialAccountIdentity = Readonly<{
  provider: VerifiedSocialProvider;
  displayLabel: string;
  url: string;
}>;
export type OwnSocialAccountIdentity = PublicSocialAccountIdentity & Readonly<{
  identityId: string;
  version: 1 | 2;
  state: "active" | "disconnected" | "revoked";
  verifiedAt: string;
  endedAt: string | null;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const URLS: Record<VerifiedSocialProvider, RegExp> = {
  tiktok: /^https:\/\/www\.tiktok\.com\/@[A-Za-z0-9_][A-Za-z0-9_.]{0,63}$/u,
  youtube: /^https:\/\/www\.youtube\.com\/channel\/UC[A-Za-z0-9_-]{22}$/u,
  x: /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/u,
  instagram: /^https:\/\/www\.instagram\.com\/[A-Za-z0-9_][A-Za-z0-9_.]{0,63}$/u,
  facebook: /^https:\/\/www\.facebook\.com\/[A-Za-z0-9][A-Za-z0-9.]{0,99}$/u,
};
const RESERVED: Partial<Record<VerifiedSocialProvider, readonly string[]>> = {
  x: ["home", "intent", "i", "search", "explore", "settings", "messages", "compose", "login", "signup", "share"],
  instagram: ["accounts", "explore", "direct", "p", "reel", "reels", "stories"],
  facebook: ["dialog", "login", "logout", "share", "sharer", "sharer.php", "profile.php", "watch", "groups", "pages", "events", "marketplace", "gaming", "help", "settings", "reel", "reels", "stories"],
};
function unavailable(): never {
  throw new AuthError(503, "Social accounts are temporarily unavailable", "SOCIAL_IDENTITY_UNAVAILABLE");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) unavailable();
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) unavailable();
}
function publicFields(value: Record<string, unknown>): PublicSocialAccountIdentity {
  if (typeof value.provider !== "string" || !Object.hasOwn(URLS, value.provider)) unavailable();
  const provider = value.provider as VerifiedSocialProvider;
  if (typeof value.url !== "string" || !URLS[provider].test(value.url) ||
    RESERVED[provider]?.includes(value.url.slice(value.url.lastIndexOf("/") + 1).toLowerCase()) ||
    typeof value.displayLabel !== "string" || !value.displayLabel.trim() ||
    Array.from(value.displayLabel).length > 100 || /\p{Cc}/u.test(value.displayLabel)) unavailable();
  return { provider, displayLabel: value.displayLabel, url: value.url };
}
function session(value: string) {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new AuthError(401, "Not authenticated", "NOT_AUTHENTICATED");
  }
}
async function rpc(name: string, parameters: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(name, parameters);
  if (error) {
    if (error.code === "28000") throw new AuthError(401, "Not authenticated", "NOT_AUTHENTICATED");
    if (error.message === "SOCIAL_IDENTITY_NOT_AVAILABLE" || error.message === "SOCIAL_IDENTITY_REQUEST_INVALID") {
      throw new AuthError(409, "Social account change could not be completed. Refresh and try again.", "SOCIAL_IDENTITY_CONFLICT");
    }
    unavailable();
  }
  return data as unknown;
}
const PUBLIC_KEYS = ["provider", "displayLabel", "url"];
export async function loadOwnSocialAccountIdentities(sessionId: string): Promise<readonly OwnSocialAccountIdentity[]> {
  session(sessionId);
  const data = await rpc("get_own_social_account_identities", { p_session_id: sessionId });
  if (!Array.isArray(data) || data.length > 5) unavailable();
  const seen = new Set<string>();
  return Object.freeze(data.map((entry) => {
    const item = object(entry);
    exact(item, [...PUBLIC_KEYS, "identityId", "version", "state", "verifiedAt", "endedAt"]);
    const fields = publicFields(item);
    if (seen.has(fields.provider)) unavailable();
    seen.add(fields.provider);
    if (typeof item.identityId !== "string" || !UUID.test(item.identityId) ||
      typeof item.verifiedAt !== "string" || !Number.isFinite(Date.parse(item.verifiedAt)) ||
      (item.state === "active" ? item.version !== 1 || item.endedAt !== null :
        !["disconnected", "revoked"].includes(String(item.state)) || item.version !== 2 ||
        typeof item.endedAt !== "string" || !Number.isFinite(Date.parse(item.endedAt)) ||
        Date.parse(item.endedAt) < Date.parse(item.verifiedAt))) unavailable();
    return Object.freeze({ ...fields, identityId: item.identityId, version: item.version as 1 | 2,
      state: item.state as OwnSocialAccountIdentity["state"], verifiedAt: item.verifiedAt, endedAt: item.endedAt as string | null });
  }));
}

// Shared canonical read for public consumers. No cross-request cache or legacy fallback.
export async function loadPublicSocialAccountIdentities(
  publicProfileId: string, surface: "profile" | "submission",
): Promise<readonly PublicSocialAccountIdentity[]> {
  if (!UUID.test(publicProfileId) || !["profile", "submission"].includes(surface)) return Object.freeze([]);
  const data = await rpc("get_public_social_account_identities", { p_public_profile_id: publicProfileId, p_surface: surface });
  if (!Array.isArray(data) || data.length > 5) unavailable();
  const seen = new Set<string>();
  return Object.freeze(data.map((entry) => {
    const item = object(entry); exact(item, PUBLIC_KEYS);
    const fields = publicFields(item);
    if (seen.has(fields.provider)) unavailable();
    seen.add(fields.provider);
    return Object.freeze(fields);
  }));
}

export async function disconnectOwnSocialAccountIdentity(
  sessionId: string, identityId: string, expectedVersion: number, requestId: string,
): Promise<Readonly<{ identityId: string; version: 2 }>> {
  session(sessionId);
  if (!UUID.test(identityId) || !UUID.test(requestId) || expectedVersion !== 1) {
    throw new AuthError(400, "Invalid social account change", "SOCIAL_IDENTITY_REQUEST_INVALID");
  }
  const result = object(await rpc("disconnect_own_social_account_identity", {
    p_session_id: sessionId, p_identity_id: identityId, p_expected_version: expectedVersion, p_request_id: requestId,
  }));
  exact(result, ["identityId", "version"]);
  if (result.identityId !== identityId || result.version !== 2) unavailable();
  return Object.freeze({ identityId, version: 2 });
}
