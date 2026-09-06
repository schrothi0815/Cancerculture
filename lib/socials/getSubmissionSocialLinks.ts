import "server-only";
import { supabaseServer } from "@/lib/db/server";
import { loadPublicSocialAccountIdentities, type PublicSocialAccountIdentity } from "@/lib/socials/socialAccountIdentities.server";

export type SubmissionSocialLink = PublicSocialAccountIdentity;

// Resolve the concrete public submission before its owner. Never read social snapshots.
export async function getSubmissionSocialLinksBySubmissionIds(
  submissionIds: number[]
): Promise<Map<number, readonly SubmissionSocialLink[]>> {
  const ids = [...new Set(submissionIds.filter(id => Number.isSafeInteger(id) && id > 0))];
  const result = new Map<number, readonly SubmissionSocialLink[]>();
  if (!ids.length) return result;
  const submissions = await supabaseServer.from("submissions")
    .select("id, cycle_id, discord_user_id, is_disqualified, public_visibility_status")
    .in("id", ids);
  if (submissions.error) throw new Error("PUBLIC_SUBMISSION_SOCIALS_UNAVAILABLE");
  const visible = (submissions.data ?? []).filter(row => ids.includes(row.id) &&
    Number.isSafeInteger(row.cycle_id) && row.cycle_id > 0 &&
    row.is_disqualified !== true && row.public_visibility_status === "visible" &&
    typeof row.discord_user_id === "string" && row.discord_user_id.length > 0);
  if (!visible.length) return result;
  const cycles = await supabaseServer.from("voting_cycles").select("id, status")
    .in("id", [...new Set(visible.map(row => row.cycle_id))]).eq("status", "finished");
  if (cycles.error) throw new Error("PUBLIC_SUBMISSION_SOCIALS_UNAVAILABLE");
  const finished = new Set((cycles.data ?? []).filter(row => row.status === "finished").map(row => row.id));
  const revealed = visible.filter(row => finished.has(row.cycle_id));
  if (!revealed.length) return result;
  const users = await supabaseServer.from("user_logs").select("discord_user_id, public_profile_id")
    .in("discord_user_id", [...new Set(revealed.map(row => row.discord_user_id))]);
  if (users.error) throw new Error("PUBLIC_SUBMISSION_SOCIALS_UNAVAILABLE");
  const profiles = new Map((users.data ?? []).map(row => [row.discord_user_id, row.public_profile_id]));
  // Deduplicate only within this read; every new response observes current consent.
  const links = new Map(await Promise.all([...new Set(profiles.values())]
    .filter((id): id is string => typeof id === "string")
    .map(async id => [id, await loadPublicSocialAccountIdentities(id, "submission")] as const)));
  for (const row of revealed) result.set(row.id, links.get(profiles.get(row.discord_user_id)) ?? []);
  return result;
}
