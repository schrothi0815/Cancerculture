import { supabaseAdmin } from "@/lib/db/admin";

export async function logVote({
  cycleId,
  submissionId,
  ownerHash,
  status,
  reason,
}: {
  cycleId: string | number;
  submissionId?: string | number;
  ownerHash: string;
  status: "accepted" | "rejected";
  reason?: string;
}) {
  try {
    await supabaseAdmin.from("vote_logs").insert({
      cycle_id: String(cycleId),
      submission_id: submissionId ? String(submissionId) : null,
      owner_hash: ownerHash,
      status,
      reason: reason ?? null,
    });
  } catch {
    // Logs dürfen niemals den Vote blockieren
  }
}
