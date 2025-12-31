export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { createOwnerHash } from "@/lib/security/ownerHash";
import { supabaseAdmin } from "@/lib/db/admin";
import { r2 } from "@/lib/r2";
import { logUpload } from "@/lib/logging/logUpload";

/* ================= ENTRY ================= */

export async function POST(req: Request) {
  try {
    // 1️⃣ Auth via Discord Cookie
    const cookieStore = await cookies();
    const discordUserId = cookieStore.get("discord_user_id")?.value;

    if (!discordUserId) {
      await logUpload({
        cycleId: null,
        ownerHash: null,
        status: "failed",
        reason: "unauthorized",
      });

      return NextResponse.json(
        { error: "Not authenticated with Discord" },
        { status: 401 }
      );
    }

    // 2️⃣ IP-Adresse ermitteln (Upload-only, kein Tracking)
    const forwardedFor = req.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor
      ? forwardedFor.split(",")[0].trim()
      : "0.0.0.0";

    // 3️⃣ FormData + File
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      await logUpload({
        cycleId: null,
        ownerHash: null,
        status: "failed",
        reason: "no_file",
      });

      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // 4️⃣ Metadaten
    const xUsername =
      formData.get("xUsername")?.toString() ?? "";
    const walletAddress =
      formData.get("walletAddress")?.toString() ?? "";
    const payoutChoice =
      formData.get("payoutChoice")?.toString() ?? null;
    const splitPercentRaw =
      formData.get("splitPercent")?.toString();
    const charity =
      formData.get("charity")?.toString() ?? null;

    const splitPercent = splitPercentRaw
      ? parseInt(splitPercentRaw, 10)
      : null;

    if (!xUsername || !walletAddress || !payoutChoice) {
      await logUpload({
        cycleId: null,
        ownerHash: null,
        status: "failed",
        reason: "validation_failed",
      });

      return NextResponse.json(
        { error: "Missing submission metadata" },
        { status: 400 }
      );
    }

    if (
      payoutChoice === "split" &&
      (!splitPercent ||
        splitPercent <= 0 ||
        splitPercent >= 100)
    ) {
      await logUpload({
        cycleId: null,
        ownerHash: null,
        status: "failed",
        reason: "validation_failed",
      });

      return NextResponse.json(
        { error: "Invalid split percentage" },
        { status: 400 }
      );
    }

    if (
      (payoutChoice === "donate" ||
        payoutChoice === "split") &&
      !charity
    ) {
      await logUpload({
        cycleId: null,
        ownerHash: null,
        status: "failed",
        reason: "validation_failed",
      });

      return NextResponse.json(
        { error: "Charity required" },
        { status: 400 }
      );
    }

    // 5️⃣ File-Type prüfen
    if (!file.type.startsWith("image/")) {
      await logUpload({
        cycleId: null,
        ownerHash: null,
        status: "failed",
        reason: "invalid_file_type",
      });

      return NextResponse.json(
        { error: "Invalid file type" },
        { status: 400 }
      );
    }

    // 6️⃣ Aktiven Cycle holen
    const { data: cycle } = await supabaseAdmin
      .from("voting_cycles")
      .select("id")
      .eq("status", "active")
      .single();

    if (!cycle) {
      await logUpload({
        cycleId: null,
        ownerHash: null,
        status: "failed",
        reason: "no_active_cycle",
      });

      return NextResponse.json(
        { error: "No active voting cycle" },
        { status: 400 }
      );
    }

    // 7️⃣ Owner-Hash
    const ownerHash = createOwnerHash(
      discordUserId,
      cycle.id
    );

    // 8️⃣ Duplicate Check
    const { data: existing } = await supabaseAdmin
      .from("submissions")
      .select("id")
      .eq("cycle_id", cycle.id)
      .eq("owner_hash", ownerHash)
      .maybeSingle();

    if (existing) {
      await logUpload({
        cycleId: cycle.id,
        ownerHash,
        status: "failed",
        reason: "duplicate_submission",
      });

      return NextResponse.json(
        { error: "You already uploaded for this cycle" },
        { status: 400 }
      );
    }

    // 9️⃣ R2 Upload
    const buffer = Buffer.from(
      await file.arrayBuffer()
    );

    const ext = file.name.split(".").pop() || "jpg";
    const timestamp = Date.now();
    const key = `cycle-${cycle.id}/${discordUserId}-${timestamp}.${ext}`;

    try {
      await r2.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME!,
          Key: key,
          Body: buffer,
          ContentType: file.type,
        })
      );
    } catch (err) {
      await logUpload({
        cycleId: cycle.id,
        ownerHash,
        status: "failed",
        reason: "storage_error",
      });

      throw err;
    }

    const imageUrl = `${process.env.R2_PUBLIC_BASE_URL}/${key}`;

    // 🔟 Submission speichern
    const { data: submission, error: insertError } =
      await supabaseAdmin
        .from("submissions")
        .insert({
          cycle_id: cycle.id,
          owner_hash: ownerHash,
          image_url: imageUrl,
        })
        .select()
        .single();

    if (insertError || !submission) {
      await logUpload({
        cycleId: cycle.id,
        ownerHash,
        status: "failed",
        reason: "db_error",
      });

      throw insertError;
    }

    // 🔐 Private Submission-Daten
    const { error: privateError } =
      await supabaseAdmin
        .from("submission_private_data")
        .insert({
          submission_id: submission.id,
          x_username: xUsername,
          wallet_address: walletAddress,
          payout_choice: payoutChoice,
          split_percent: splitPercent,
          charity,
        });

    if (privateError) {
      await logUpload({
        cycleId: cycle.id,
        ownerHash,
        submissionId: submission.id,
        status: "failed",
        reason: "db_error",
      });

      throw privateError;
    }

// 🧾 IP-Log (Upload only, max. 72h, kein Tracking)
const { error: ipLogError } = await supabaseAdmin
  .from("upload_ip_logs")
  .insert({
    submission_id: submission.id,
    ip_address: ipAddress,
    delete_after: new Date(
      Date.now() + 72 * 60 * 60 * 1000
    ).toISOString(),
  });

if (ipLogError) {
  // bewusst nur warnen – Upload bleibt gültig
  console.warn("IP log failed:", ipLogError.message);
}


    // ✅ Erfolg loggen
    await logUpload({
      cycleId: cycle.id,
      ownerHash,
      submissionId: submission.id,
      status: "success",
    });

    return NextResponse.json({
      success: true,
      imageUrl,
    });
  } catch (error) {
    console.error("UPLOAD ERROR", error);

    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
