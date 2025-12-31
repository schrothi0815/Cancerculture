import { supabaseAdmin } from "@/lib/db/admin";

export async function logModerationAction({
  actorRole,
  actorId,
  action,
  targetType,
  targetId,
  reasonCode,
  reasonText,
  evidence,
}: {
  actorRole: "admin" | "mod" | "system";
  actorId: string;

  action: string;
  targetType: string;
  targetId: string | number;

  reasonCode?: string; // ✅ OPTIONAL
  reasonText?: string;
  evidence?: Record<string, any>;
}) {
  // Moderation Logs dürfen NIEMALS crashen
  try {
    await supabaseAdmin
      .from("moderation_action_logs")
      .insert({
        actor_role: actorRole,
        actor_id: actorId,
        action,
        target_type: targetType,
        target_id: String(targetId),
        reason_code: reasonCode ?? null, // ✅ sauber
        reason_text: reasonText ?? null,
        evidence: evidence ?? null,
      });
  } catch {
    // bewusst leer
  }
}
