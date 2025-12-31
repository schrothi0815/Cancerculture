import { supabaseAdmin } from "@/lib/db/admin";

export async function logUpload({
  cycleId,
  ownerHash,
  submissionId,
  status,
  reason,
}: {
  cycleId: number | null;
  ownerHash: string | null;
  submissionId?: number;
  status: "success" | "failed";
  reason?: string;
}) {
  try {
    await supabaseAdmin.from("upload_logs").insert({
      cycle_id: cycleId,
      owner_hash: ownerHash,
      submission_id: submissionId ?? null,
      status,
      reason: reason ?? null,
    });
  } catch {
    // Logs dürfen NIE crashen
  }
}
