export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { finalizeCycles } from "@/lib/workers/finalizeCycles";

/* ================= ENTRY ================= */

export async function POST(req: Request) {
  try {
    const isDev = process.env.NODE_ENV !== "production";

    if (!isDev) {
      const isVercelCron =
        req.headers.get("x-vercel-cron") === "1";
      const auth = req.headers.get("authorization");
      const isSecretValid =
        auth === `Bearer ${process.env.CRON_SECRET}`;

      if (!isVercelCron && !isSecretValid) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    console.log(
      "[CRON] finalize-cycles triggered",
      new Date().toISOString(),
      {
        vercelCron: req.headers.get("x-vercel-cron"),
        env: process.env.NODE_ENV,
      }
    );

    const result = await finalizeCycles({
      source: "cron",
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { error: "Worker failed" },
      { status: 500 }
    );
  }
}

// Dev-Trigger
export async function GET() {
  return POST(new Request("http://localhost"));
}
