import { supabaseAdmin } from "@/lib/db/admin";

type LogLevel = "info" | "warn" | "error";

export async function logWorker({
  worker,
  level,
  message,
  cycleId,
  context,
}: {
  worker: string;
  level: LogLevel;
  message: string;
  cycleId?: string | number;
  context?: Record<string, any>;
}) {
  await supabaseAdmin.from("system_worker_logs").insert({
    worker_name: worker,
    level,
    message,
    cycle_id: cycleId ? String(cycleId) : null,
    context: context ?? null,
  });
}
