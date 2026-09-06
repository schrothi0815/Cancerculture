import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AuthError, getAuthErrorCode } from "@/lib/auth/AuthError";
import { getValidatedApplicationOrigin } from "@/lib/auth/oauth/safeReturnPath";
import { supabaseAdmin } from "@/lib/db/admin";

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const CALLBACK_PATH = "/api/profile/social-accounts/tiktok/callback";
const REQUIRED_SCOPES = Object.freeze(["user.info.basic", "user.info.profile"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STATE = /^[A-Za-z0-9_-]{43}$/u;
const CODE = /^[^\p{Cc}\s]{1,2048}$/u;
const USERNAME = /^[A-Za-z0-9_][A-Za-z0-9_.]{0,63}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const MAX_PROVIDER_RESPONSE_BYTES = 64 * 1024;

type TikTokConfig = Readonly<{
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
}>;

type ClaimedAttempt = Readonly<{ attemptId: string; version: 2 }>;
type TikTokIdentity = Readonly<{
  providerAccountId: string;
  publicLocator: string;
  displayLabel: string;
}>;

export type TikTokCallbackResult =
  | "connected"
  | "cancelled"
  | "expired"
  | "missing_scope"
  | "invalid_identity"
  | "conflict"
  | "session"
  | "unavailable"
  | "invalid";

class TikTokProviderError extends Error {
  readonly result: TikTokCallbackResult;
  readonly reason:
    | "missing_scope"
    | "provider_unavailable"
    | "invalid_provider_identity"
    | "identity_conflict";

  constructor(
    result: TikTokCallbackResult,
    reason:
      | "missing_scope"
      | "provider_unavailable"
      | "invalid_provider_identity"
      | "identity_conflict",
  ) {
    super("TikTok connection could not be completed");
    this.name = "TikTokProviderError";
    this.result = result;
    this.reason = reason;
  }
}

function controlled(value: string, min: number, max: number) {
  return value.length >= min && value.length <= max && !/\p{Cc}/u.test(value);
}

function getTikTokConfig(): TikTokConfig | null {
  const mode = process.env.TIKTOK_LOGIN_KIT_MODE?.trim();
  const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim() ?? "";
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = process.env.TIKTOK_REDIRECT_URI?.trim() ?? "";
  if ((mode !== "sandbox" && mode !== "production") ||
    !controlled(clientKey, 1, 256) || !controlled(clientSecret, 16, 512)) return null;
  try {
    const applicationOrigin = getValidatedApplicationOrigin(process.env.NEXT_PUBLIC_BASE_URL);
    const redirect = new URL(redirectUri);
    if (redirect.protocol !== "https:" || redirect.username || redirect.password || redirect.port ||
      redirect.search || redirect.hash || redirect.pathname !== CALLBACK_PATH ||
      redirect.origin !== applicationOrigin.origin || redirectUri !== redirect.href) return null;
  } catch {
    return null;
  }
  return Object.freeze({ clientKey, clientSecret, redirectUri });
}

export function isTikTokOAuthConfigured() {
  return getTikTokConfig() !== null;
}

function unavailable(): never {
  throw new AuthError(503, "TikTok connection is temporarily unavailable", "SOCIAL_TIKTOK_UNAVAILABLE");
}

function digestState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) unavailable();
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) unavailable();
}

async function rpc(name: string, parameters: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(name, parameters);
  if (error) {
    if (error.code === "28000") throw new AuthError(401, "Not authenticated", "NOT_AUTHENTICATED");
    if (error.message === "SOCIAL_TIKTOK_ATTEMPT_EXPIRED") {
      throw new AuthError(409, "TikTok connection request expired", "SOCIAL_TIKTOK_EXPIRED");
    }
    if (["SOCIAL_TIKTOK_NOT_AVAILABLE", "SOCIAL_TIKTOK_ATTEMPT_IN_PROGRESS",
      "SOCIAL_TIKTOK_REQUEST_INVALID", "SOCIAL_IDENTITY_NOT_AVAILABLE",
      "SOCIAL_IDENTITY_REQUEST_INVALID"].includes(error.message)) {
      throw new AuthError(409, "TikTok connection could not be completed", "SOCIAL_TIKTOK_CONFLICT");
    }
    unavailable();
  }
  return data as unknown;
}

export async function startTikTokOAuth(sessionId: string) {
  if (!UUID.test(sessionId)) throw new AuthError(401, "Not authenticated", "NOT_AUTHENTICATED");
  const config = getTikTokConfig();
  if (!config) unavailable();
  const state = randomBytes(32).toString("base64url");
  const attemptId = randomUUID();
  const receipt = object(await rpc("start_tiktok_social_account_link", {
    p_session_id: sessionId,
    p_attempt_id: attemptId,
    p_state_digest: digestState(state),
  }));
  exact(receipt, ["attemptId", "expiresAt"]);
  if (receipt.attemptId !== attemptId || typeof receipt.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.expiresAt))) unavailable();

  const authorize = new URL(AUTHORIZE_URL);
  authorize.searchParams.set("client_key", config.clientKey);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", REQUIRED_SCOPES.join(","));
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("disable_auto_auth", "1");
  return Object.freeze({ authorizeUrl: authorize.href });
}

async function claimAttempt(sessionId: string, state: string): Promise<ClaimedAttempt | "expired"> {
  const receipt = object(await rpc("claim_tiktok_social_account_link", {
    p_session_id: sessionId,
    p_state_digest: digestState(state),
  }));
  if (receipt.outcome === "expired" && Object.keys(receipt).length === 1) return "expired";
  exact(receipt, ["outcome", "attemptId", "version"]);
  if (receipt.outcome !== "claimed" || typeof receipt.attemptId !== "string" ||
    !UUID.test(receipt.attemptId) || receipt.version !== 2) unavailable();
  return Object.freeze({ attemptId: receipt.attemptId, version: 2 });
}

async function finishAttempt(
  sessionId: string,
  attempt: ClaimedAttempt,
  outcome: "denied" | "failed",
  reason: TikTokProviderError["reason"] | "consent_denied",
) {
  const parameters = {
    p_session_id: sessionId, p_attempt_id: attempt.attemptId, p_attempt_version: attempt.version,
    p_outcome: outcome, p_reason: reason,
  };
  let data: unknown;
  try { data = await rpc("finish_tiktok_social_account_link", parameters); }
  catch (error) {
    if (getAuthErrorCode(error) !== "SOCIAL_TIKTOK_UNAVAILABLE") throw error;
    data = await rpc("finish_tiktok_social_account_link", parameters);
  }
  const receipt = object(data);
  exact(receipt, ["attemptId", "version", "status"]);
  if (receipt.attemptId !== attempt.attemptId || receipt.version !== 3 ||
    !["denied", "failed", "expired"].includes(String(receipt.status))) unavailable();
  return receipt.status as "denied" | "failed" | "expired";
}

function scopes(value: string | null) {
  if (!value || value.length > 512) return new Set<string>();
  return new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
}

function hasRequiredScopes(value: string | null) {
  const granted = scopes(value);
  return REQUIRED_SCOPES.every((scope) => granted.has(scope));
}

async function json(response: Response) {
  const text = await response.text();
  if (text.length > MAX_PROVIDER_RESPONSE_BYTES) throw new TikTokProviderError("unavailable", "provider_unavailable");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new TikTokProviderError("unavailable", "provider_unavailable");
  }
}

async function exchangeCode(config: TikTokConfig, code: string) {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: new URLSearchParams({
        client_key: config.clientKey,
        client_secret: config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TikTokProviderError("unavailable", "provider_unavailable");
  }
  if (!response.ok) throw new TikTokProviderError(response.status >= 500 || response.status === 429 ? "unavailable" : "invalid", "provider_unavailable");
  const payload = object(await json(response));
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const openId = typeof payload.open_id === "string" ? payload.open_id.trim() : "";
  const scope = typeof payload.scope === "string" ? payload.scope : null;
  const tokenType = typeof payload.token_type === "string" ? payload.token_type.toLowerCase() : "";
  if (!controlled(accessToken, 1, 4096) || !controlled(openId, 1, 256) || tokenType !== "bearer") {
    throw new TikTokProviderError("invalid_identity", "invalid_provider_identity");
  }
  if (!hasRequiredScopes(scope)) throw new TikTokProviderError("missing_scope", "missing_scope");
  return Object.freeze({ accessToken, openId });
}

function parseIdentity(payload: unknown, expectedOpenId: string): TikTokIdentity {
  const root = object(payload);
  const error = object(root.error);
  const data = object(root.data);
  const user = object(data.user);
  const openId = typeof user.open_id === "string" ? user.open_id.trim() : "";
  const username = typeof user.username === "string" ? user.username.trim() : "";
  if (error.code !== "ok" || openId !== expectedOpenId || !controlled(openId, 1, 256) || !USERNAME.test(username)) {
    throw new TikTokProviderError("invalid_identity", "invalid_provider_identity");
  }
  return Object.freeze({ providerAccountId: openId, publicLocator: username, displayLabel: `@${username}` });
}

async function loadIdentity(accessToken: string, expectedOpenId: string) {
  const url = new URL(USER_INFO_URL);
  url.searchParams.set("fields", "open_id,username");
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TikTokProviderError("unavailable", "provider_unavailable");
  }
  if (!response.ok) throw new TikTokProviderError(response.status >= 500 || response.status === 429 ? "unavailable" : "invalid_identity", "provider_unavailable");
  return parseIdentity(await json(response), expectedOpenId);
}

async function completeAttempt(sessionId: string, attempt: ClaimedAttempt, identity: TikTokIdentity) {
  const parameters = {
    p_session_id: sessionId,
    p_attempt_id: attempt.attemptId,
    p_attempt_version: attempt.version,
    p_provider_account_id: identity.providerAccountId,
    p_public_locator: identity.publicLocator,
    p_display_label: identity.displayLabel,
  };
  let data: unknown;
  try { data = await rpc("complete_tiktok_social_account_link", parameters); }
  catch (error) {
    if (getAuthErrorCode(error) !== "SOCIAL_TIKTOK_UNAVAILABLE") throw error;
    data = await rpc("complete_tiktok_social_account_link", parameters);
  }
  const receipt = object(data);
  exact(receipt, ["identityId", "version"]);
  if (typeof receipt.identityId !== "string" || !UUID.test(receipt.identityId) || receipt.version !== 1) unavailable();
}

async function revokeToken(config: TikTokConfig, accessToken: string) {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: new URLSearchParams({ client_key: config.clientKey, client_secret: config.clientSecret, token: accessToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // The token is never persisted and is discarded even when remote revoke is unavailable.
  }
}

function one(searchParams: URLSearchParams, name: string) {
  const values = searchParams.getAll(name);
  return values.length === 1 ? values[0] : null;
}

function authResult(error: unknown): TikTokCallbackResult {
  return getAuthErrorCode(error) === "NOT_AUTHENTICATED" ? "session" :
    getAuthErrorCode(error) === "SOCIAL_TIKTOK_CONFLICT" ? "conflict" : "unavailable";
}

export async function handleTikTokOAuthCallback(
  sessionId: string,
  searchParams: URLSearchParams,
): Promise<TikTokCallbackResult> {
  if (!UUID.test(sessionId)) return "session";
  const state = one(searchParams, "state");
  if (!state || !STATE.test(state) || !DIGEST.test(digestState(state))) return "invalid";

  let attempt: ClaimedAttempt | "expired";
  try {
    attempt = await claimAttempt(sessionId, state);
  } catch (error) {
    return authResult(error);
  }
  if (attempt === "expired") return "expired";

  if (one(searchParams, "error")) {
    try { return await finishAttempt(sessionId, attempt, "denied", "consent_denied") === "expired" ? "expired" : "cancelled"; }
    catch { return "unavailable"; }
  }
  const code = one(searchParams, "code");
  if (!code || !CODE.test(code)) {
    try { return await finishAttempt(sessionId, attempt, "failed", "provider_unavailable") === "expired" ? "expired" : "invalid"; }
    catch { return "unavailable"; }
  }
  if (!hasRequiredScopes(one(searchParams, "scopes"))) {
    try { return await finishAttempt(sessionId, attempt, "failed", "missing_scope") === "expired" ? "expired" : "missing_scope"; }
    catch { return "unavailable"; }
  }

  const config = getTikTokConfig();
  if (!config) {
    try { await finishAttempt(sessionId, attempt, "failed", "provider_unavailable"); } catch { return "unavailable"; }
    return "unavailable";
  }

  let accessToken: string | null = null;
  try {
    const token = await exchangeCode(config, code);
    accessToken = token.accessToken;
    const identity = await loadIdentity(token.accessToken, token.openId);
    await completeAttempt(sessionId, attempt, identity);
    return "connected";
  } catch (error) {
    const providerError = error instanceof TikTokProviderError ? error : null;
    const conflict = getAuthErrorCode(error) === "SOCIAL_TIKTOK_CONFLICT";
    const expired = getAuthErrorCode(error) === "SOCIAL_TIKTOK_EXPIRED";
    const reason = conflict ? "identity_conflict" : providerError?.reason ?? "provider_unavailable";
    try {
      const status = await finishAttempt(sessionId, attempt, "failed", reason);
      if (status === "expired" || expired) return "expired";
    } catch { return "unavailable"; }
    return conflict ? "conflict" : providerError?.result ?? "unavailable";
  } finally {
    if (accessToken) await revokeToken(config, accessToken);
    accessToken = null;
  }
}
