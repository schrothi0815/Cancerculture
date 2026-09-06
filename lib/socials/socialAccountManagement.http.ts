import { getAuthErrorStatus, AuthError } from "@/lib/auth/AuthError";
import { getValidatedApplicationOrigin } from "@/lib/auth/oauth/safeReturnPath";
import { requireSameOrigin } from "@/lib/http/requireSameOrigin";

export function socialManagementJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" } });
}
export function socialManagementError(error: unknown) {
  const status = getAuthErrorStatus(error) ?? 503;
  return socialManagementJson({ error: status === 401 ? "NOT_AUTHENTICATED" : status === 403 ? "ACCESS_DENIED" :
    status === 400 ? "INVALID_INPUT" : status === 409 ? "SOCIAL_SETTINGS_CONFLICT" : "SOCIAL_SETTINGS_UNAVAILABLE" }, status);
}
export async function readSocialManagementRequest(request: Request, keys: readonly string[]) {
  requireSameOrigin(
    request,
    getValidatedApplicationOrigin(process.env.NEXT_PUBLIC_BASE_URL).origin,
  );
  const text = await request.text();
  let body: unknown;
  try { body = text.length <= 2048 ? JSON.parse(text) : null; } catch { body = null; }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== keys.length ||
    Object.keys(body).some(key => !keys.includes(key))) throw new AuthError(400, "Invalid request", "INVALID_INPUT");
  return body as Record<string, unknown>;
}
