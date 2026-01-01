import { supabaseAdmin } from "@/lib/db/admin";
import { logWorker } from "@/lib/logging/logWorker";

export async function finalizeCycles({
  source,
}: {
  source: "cron" | "admin";
}) {
  // ▶️ Worker gestartet
  await logWorker({
    worker: "finalize-cycles",
    level: "info",
    message: "Worker started",
    context: { source },
  });

  // 🔍 Cycles finden
  const { data: cycles, error } = await supabaseAdmin
    .from("voting_cycles")
    .select("id")
    .eq("status", "finished")
    .eq("winners_published", false);

  if (error) throw error;

  // 💤 Nichts zu tun
  if (!cycles || cycles.length === 0) {
    await logWorker({
      worker: "finalize-cycles",
      level: "info",
      message: "No finished cycles found",
      context: { source },
    });

    return { processed: 0 };
  }

  // 🔁 Cycles verarbeiten
  for (const cycle of cycles) {
    await logWorker({
      worker: "finalize-cycles",
      level: "info",
      message: "Processing cycle",
      cycleId: cycle.id,
      context: { source },
    });

    await finalizeCycle(cycle.id, source);
  }

  return { processed: cycles.length };
}

/* ================= HELPERS ================= */

async function finalizeCycle(
  cycleId: number,
  source: "cron" | "admin"
) {
  await logWorker({
    worker: "finalize-cycles",
    level: "info",
    message: "Finalize cycle started",
    cycleId,
    context: { source },
  });

  const { data: results } = await supabaseAdmin
    .from("cycle_results")
    .select("*")
    .eq("cycle_id", cycleId);

  if (!results || results.length === 0) {
    await logWorker({
      worker: "finalize-cycles",
      level: "warn",
      message: "No cycle_results found for cycle",
      cycleId,
      context: { source },
    });
    return;
  }

  const maxVotes = Math.max(...results.map((r) => r.vote_count));
  const winners = results.filter((r) => r.vote_count === maxVotes);

  if (winners.length === 0) {
    throw new Error(`No winners for cycle ${cycleId}`);
  }

  const winShare = 1 / winners.length;

  for (const w of winners) {
    await supabaseAdmin
      .from("cycle_results")
      .update({ is_winner: true, rank: 1 })
      .eq("id", w.id);

    await createWinnerPublicProfile(
      cycleId,
      w.submission_id,
      winShare,
      source
    );
  }

  await supabaseAdmin
    .from("voting_cycles")
    .update({ winners_published: true })
    .eq("id", cycleId);

  await logWorker({
    worker: "finalize-cycles",
    level: "info",
    message: "Winners published for cycle",
    cycleId,
    context: { source },
  });
}

async function createWinnerPublicProfile(
  cycleId: number,
  submissionId: number,
  winShare: number,
  source: "cron" | "admin"
) {
  const { data: submission, error: submissionError } =
    await supabaseAdmin
      .from("submissions")
      .select("image_url")
      .eq("id", submissionId)
      .single();

  if (submissionError || !submission) {
    throw new Error(
      `Submission missing for submission_id=${submissionId}`
    );
  }

  const { data: privateData, error: privateError } =
    await supabaseAdmin
      .from("submission_private_data")
      .select("*")
      .eq("submission_id", submissionId)
      .single();

  if (privateError || !privateData) {
    await logWorker({
      worker: "finalize-cycles",
      level: "warn",
      message: "Skipping submission without private data",
      cycleId,
      context: { submissionId, source },
    });
    return;
  }

  const wall =
    privateData.payout_choice === "keep" ? "shame" : "fame";

  const { data: resultRow, error: resultError } =
    await supabaseAdmin
      .from("cycle_results")
      .select("vote_count")
      .eq("cycle_id", cycleId)
      .eq("submission_id", submissionId)
      .single();

  if (resultError || !resultRow) {
    throw new Error(
      `Missing cycle_results for submission_id=${submissionId}`
    );
  }

  const { error: insertError } = await supabaseAdmin
    .from("winner_public_profiles")
    .insert({
      cycle_id: cycleId,
      submission_id: submissionId,
      image_url: submission.image_url,
      wall,
      x_username: privateData.x_username,
      wallet_address: privateData.wallet_address,
      payout_choice: privateData.payout_choice,
      split_percent: privateData.split_percent,
      charity: privateData.charity,
      win_share: winShare,
      vote_count: resultRow.vote_count,
    });

  if (insertError && insertError.code !== "23505") {
    throw insertError;
  }
}
