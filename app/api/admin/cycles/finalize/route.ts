export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { finalizeCycles } from "@/lib/workers/finalizeCycles";
import { logAdminAction } from "@/lib/audit/logAdminAction";

export async function POST() {
  try {
    // 🔐 ADMIN ONLY
    const admin = await requireAdmin();

    // ▶️ Worker ausführen
    const result = await finalizeCycles({
      source: "admin",
    });

    // 🧾 Admin-Audit-Log
    await logAdminAction({
      actorType: "admin",
      actorId: admin.discord_user_id,
      action: "finalize_cycles_triggered",
      targetType: "worker",
      meta: {
        processed: result.processed,
      },
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Forbidden" },
      { status: err.status ?? 403 }
    );
  }
}
