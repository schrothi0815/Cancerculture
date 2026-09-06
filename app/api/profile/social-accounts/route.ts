export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { AuthError } from "@/lib/auth/AuthError";
import { requireSession } from "@/lib/auth/requireSession";
import { enforceRouteMutationGate, assertServerMutationAllowed } from "@/lib/writeGate.server";
import { disconnectOwnSocialAccountIdentity } from "@/lib/socials/socialAccountIdentities.server";
import { loadOwnSocialAccountManagement } from "@/lib/socials/socialAccountManagement.server";
import { readSocialManagementRequest, socialManagementError, socialManagementJson } from "@/lib/socials/socialAccountManagement.http";

export async function GET() {
  try {
    const session = await requireSession();
    return socialManagementJson(await loadOwnSocialAccountManagement(session.session_id));
  } catch (error) { return socialManagementError(error); }
}
export async function DELETE(request: Request) {
  const gate = enforceRouteMutationGate();
  if (gate) return gate;
  try {
    const body = await readSocialManagementRequest(request, ["identityId", "expectedVersion", "requestId"]);
    const session = await requireSession();
    if (typeof body.identityId !== "string" || typeof body.requestId !== "string" || body.expectedVersion !== 1) {
      throw new AuthError(400, "Invalid request", "INVALID_INPUT");
    }
    assertServerMutationAllowed();
    await disconnectOwnSocialAccountIdentity(session.session_id, body.identityId, body.expectedVersion, body.requestId);
    return socialManagementJson(await loadOwnSocialAccountManagement(session.session_id));
  } catch (error) { return socialManagementError(error); }
}
