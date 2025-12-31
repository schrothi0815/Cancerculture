export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { supabaseAdmin as supabase } from "@/lib/db/admin";
import { logAdminAction } from "@/lib/audit/logAdminAction";

export async function POST() {
  try {
    // 🔐 ADMIN ONLY (Cookie + DB Check im Guard)
    const admin = await requireAdmin();

    // 🔍 Aktiven Cycle finden
    const { data: cycle } = await supabase
      .from("voting_cycles")
      .select("*")
      .eq("status", "active")
      .maybeSingle();

    if (!cycle) {
      return NextResponse.json(
        { error: "No active cycle found" },
        { status: 400 }
      );
    }

    // 🔒 Cycle sperren (Race-Condition-sicher)
    const { data: lockedCycle, error: lockError } =
      await supabase
        .from("voting_cycles")
        .update({ status: "finalizing" })
        .eq("id", cycle.id)
        .eq("status", "active")
        .select()
        .single();

    if (lockError || !lockedCycle) {
      return NextResponse.json(
        { error: "Cycle could not be locked" },
        { status: 409 }
      );
    }

    // 📦 Submissions holen
    const { data: submissions, error: submissionsError } =
      await supabase
        .from("submissions")
        .select("id")
        .eq("cycle_id", cycle.id)
        .eq("is_disqualified", false);

    if (submissionsError || !submissions || submissions.length === 0) {
      return NextResponse.json(
        { error: "No valid submissions" },
        { status: 400 }
      );
    }

    // 🧮 Votes zählen
    const submissionIds = submissions.map((s) => s.id);

    const { data: voteCounts, error: votesError } =
      await supabase
        .from("votes")
        .select("submission_id, count:id")
        .eq("cycle_id", cycle.id)
        .in("submission_id", submissionIds);

    if (votesError) {
      return NextResponse.json(
        { error: "Failed to count votes" },
        { status: 500 }
      );
    }

    const results = submissions.map((s) => {
      const match = voteCounts?.find(
        (v) => v.submission_id === s.id
      );
      return {
        submission_id: s.id,
        vote_count: match ? match.count : 0,
      };
    });

    const maxVotes = Math.max(
      ...results.map((r) => r.vote_count)
    );

    const finalizedResults = results.map((r) => ({
      cycle_id: cycle.id,
      submission_id: r.submission_id,
      vote_count: r.vote_count,
      is_winner: r.vote_count === maxVotes,
      rank: r.vote_count === maxVotes ? 1 : null,
    }));

    // 💾 Ergebnisse speichern
    const { error: insertError } =
      await supabase
        .from("cycle_results")
        .insert(finalizedResults);

    if (insertError) {
      return NextResponse.json(
        { error: "Failed to save results" },
        { status: 500 }
      );
    }

    // ✅ Cycle final abschließen
    const { error: finishError } =
      await supabase
        .from("voting_cycles")
        .update({
          status: "finished",
          finalized_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
        })
        .eq("id", cycle.id);

    if (finishError) {
      return NextResponse.json(
        { error: "Failed to finalize cycle" },
        { status: 500 }
      );
    }

    // 🧾 Admin-Log
    await logAdminAction({
      actorType: "admin",
      actorId: admin.discord_user_id,
      action: "cycle_finalized",
      targetType: "cycle",
      targetId: cycle.id,
      meta: {
        submissions: finalizedResults.length,
        winners: finalizedResults.filter((r) => r.is_winner).length,
        maxVotes,
      },
    });

    return NextResponse.json({
      success: true,
      cycleId: cycle.id,
      finalized: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Forbidden" },
      { status: err.status ?? 403 }
    );
  }
}
