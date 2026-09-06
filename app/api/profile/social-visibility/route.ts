export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { requireSession } from "@/lib/auth/requireSession";
import { enforceRouteMutationGate } from "@/lib/writeGate.server";
import { loadOwnSocialAccountManagement, setOwnSocialAccountVisibility } from "@/lib/socials/socialAccountManagement.server";
import { readSocialManagementRequest, socialManagementError, socialManagementJson } from "@/lib/socials/socialAccountManagement.http";

export async function PATCH(request: Request) {
  const gate = enforceRouteMutationGate();
  if (gate) return gate;
  try {
    const body = await readSocialManagementRequest(request, ["scope", "value", "expectedVersion", "requestId"]);
    const session = await requireSession();
    await setOwnSocialAccountVisibility(session.session_id, body);
    return socialManagementJson(await loadOwnSocialAccountManagement(session.session_id));
  } catch (error) { return socialManagementError(error); }
}
