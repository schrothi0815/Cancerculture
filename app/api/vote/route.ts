export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/db/admin";
import { createOwnerHash } from "@/lib/security/ownerHash";
import { logVote } from "@/lib/logging/logVote";

export async function POST(req: Request) {
  try {
    // 🔐 Auth via Discord Cookie
    const cookieStore = await cookies();
    const discordUserId = cookieStore.get("discord_user_id")?.value;

    if (!discordUserId) {
      return NextResponse.json(
        { error: "Not authenticated with Discord" },
        { status: 401 }
      );
    }

    // 📥 Input
    const { submissionId } = await req.json();
    if (!submissionId) {
      return NextResponse.json(
        { error: "Missing submissionId" },
        { status: 400 }
      );
    }

    // 🔁 Aktiven Cycle holen
    const { data: cycle, error: cycleError } =
      await supabaseAdmin
        .from("voting_cycles")
        .select("id")
        .eq("status", "active")
        .single();

    if (cycleError || !cycle) {
      return NextResponse.json(
        { error: "No active voting cycle" },
        { status: 400 }
      );
    }

    // 🔑 Owner Hash
    const ownerHash = createOwnerHash(
      discordUserId,
      cycle.id
    );

    // 📦 Submission laden (für Self-Vote-Check)
const { data: submission, error: submissionError } =
  await supabaseAdmin
    .from("submissions")
    .select("id, owner_hash")
    .eq("id", submissionId)
    .eq("cycle_id", cycle.id)
    .single();

if (submissionError || !submission) {
  return NextResponse.json(
    { error: "Submission not found" },
    { status: 404 }
  );
}

// 🚫 Self-vote verhindern
if (submission.owner_hash === ownerHash) {
  await logVote({
    cycleId: cycle.id,
    submissionId,
    ownerHash,
    status: "rejected",
    reason: "self_vote",
  });

  return NextResponse.json(
    { error: "You can’t vote for your own submission" },
    { status: 403 }
  );
}


    // 🛑 Schon gevotet?
    const { data: existingVote } = await supabaseAdmin
      .from("votes")
      .select("id")
      .eq("cycle_id", cycle.id)
      .eq("owner_hash", ownerHash)
      .maybeSingle();

    if (existingVote) {
      await logVote({
        cycleId: cycle.id,
        submissionId,
        ownerHash,
        status: "rejected",
        reason: "already_voted",
      });

      return NextResponse.json(
        { error: "You already voted in this cycle" },
        { status: 400 }
      );
    }

    // 🗳️ Vote speichern
    const { error: insertError } = await supabaseAdmin
      .from("votes")
      .insert({
        cycle_id: cycle.id,
        submission_id: submissionId,
        owner_hash: ownerHash,
      });

    if (insertError) {
      throw insertError;
    }

    // 🧾 Log
    await logVote({
      cycleId: cycle.id,
      submissionId,
      ownerHash,
      status: "accepted",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("VOTE ERROR", error);
    return NextResponse.json(
      { error: "Voting failed" },
      { status: 500 }
    );
  }
}
