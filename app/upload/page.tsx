"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/* ================= TYPES ================= */
type ScannerState = "idle" | "hover" | "uploading" | "done";
type PayoutChoice = "keep" | "donate" | "split";
type SubmitState = "idle" | "partial" | "ready";

/* ================= COMPONENT ================= */
export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------- Scanner / Upload ---------- */
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [blink, setBlink] = useState(false);

  /* ---------- Image ---------- */
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  /* ---------- Right panel ---------- */
  const [xUsername, setXUsername] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [payoutChoice, setPayoutChoice] = useState<PayoutChoice | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [charity, setCharity] = useState<string | null>(null);

  /* ---------------------------------------
     BLINK LOGIC 
  ----------------------------------------*/
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (scannerState === "idle") {
      interval = setInterval(() => setBlink((b) => !b), 900);
    }

    if (scannerState === "uploading") {
      interval = setInterval(() => setBlink((b) => !b), 300);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [scannerState]);

  /* ---------------------------------------
     SCANNER IMAGE 
  ----------------------------------------*/
  const getScannerImage = () => {
    if (scannerState === "hover") return "/scanner-v3.png";
    if (scannerState === "done") return "/scanner-v4.png";

    if (scannerState === "uploading") {
      return blink ? "/scanner-v4.png" : "/scanner-v2.png";
    }

    return blink ? "/scanner-v1.png" : "/scanner-v2.png";
  };

  /* ================= DERIVED SUBMIT STATE ================= */
  const hasImage = !!file;

  const hasMeta =
    xUsername.trim().length > 0 &&
    walletAddress.trim().length > 0 &&
    payoutChoice !== null &&
    (payoutChoice !== "split" || splitPercent > 0) &&
    (payoutChoice === "keep" || charity !== null);

  const submitState: SubmitState =
    hasImage && hasMeta ? "ready" : hasImage || hasMeta ? "partial" : "idle";

  const submitImage =
    submitState === "ready"
      ? "/submit-v4.png"
      : submitState === "partial"
      ? "/submit-v3.png"
      : "/submit-v2.png";

  /* ---------------------------------------
     EVENTS
  ----------------------------------------*/
  const handleScannerClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (!f.type.startsWith("image/")) {
      alert("Only image files allowed");
      return;
    }

    if (f.size > 10 * 1024 * 1024) {
      alert("Max file size is 10MB");
      return;
    }

    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleSubmit = () => {
    if (submitState !== "ready") return;

    // 🔐 DISCORD VERIFICATION ENTRY POINT
    console.log("Trigger Discord verification");
    alert("Discord verification starts here");
  };

  /* ================= RENDER ================= */
  return (
    <div className="relative w-full h-screen bg-orange-background overflow-hidden flex items-center justify-center">
      <div className="relative z-20 w-full max-w-6xl h-[520px]">

        {/* ================= LEFT UPLOAD SCANNER ================= */}
        <div
          className="
            absolute
            left-[clamp(-120px,-14vw,-200px)]
            top-[clamp(116px,12vh,184px)]
            w-[38%]
            bg-yellow-star
            rounded-3xl
            p-10
            flex
            items-center
            justify-center
          "
        >
          <div
            className="cursor-pointer transition-transform duration-200 hover:scale-105"
            onMouseEnter={() =>
              scannerState === "idle" && setScannerState("hover")
            }
            onMouseLeave={() =>
              scannerState === "hover" && setScannerState("idle")
            }
            onClick={handleScannerClick}
          >
            <Image
              src={getScannerImage()}
              alt="Upload scanner"
              width={420}
              height={420}
              priority
              className="drop-shadow-[0_12px_0_rgba(0,0,0,0.45)]"
            />
          </div>
        </div>

        {/* ================= IMAGE PREVIEW ================= */}
        {previewUrl && (
          <div
            className="
              absolute
              left-[clamp(80px,8vw,40px)]
              top-[clamp(-120px,-16vh,-64px)]
              left-1/2
              -translate-x-1/2
              z-30
            "
          >
            <div className="bg-white rounded-xl p-2 shadow-xl">
              <Image
                src={previewUrl}
                alt="Preview"
                width={220}
                height={220}
                className="rounded-lg object-contain"
              />
            </div>
          </div>
        )}

        {/* ================= RIGHT META PANEL ================= */}
        <div
          className="
            absolute
            right-[clamp(-40px,-4vw,-80px)]
            top-[25%]
            -translate-y-1/2
            w-[42%]
            bg-yellow-star
            rounded-3xl
            p-10
            flex
            flex-col
            gap-6
          "
        >
          <input
            placeholder="@username"
            value={xUsername}
            onChange={(e) => setXUsername(e.target.value)}
            className="rounded-xl px-4 py-2 bg-white/90 outline-none"
          />

          <input
            placeholder="Wallet address"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            className="rounded-xl px-4 py-2 bg-white/90 outline-none"
          />

          <div className="flex gap-3">
            {["keep", "donate", "split"].map((o) => (
              <button
                key={o}
                onClick={() => setPayoutChoice(o as PayoutChoice)}
                className={`flex-1 py-2 rounded-xl ${
                  payoutChoice === o
                    ? "bg-black text-yellow-300"
                    : "bg-white/80 hover:bg-white"
                }`}
              >
                {o}
              </button>
            ))}
          </div>

          {payoutChoice === "split" && (
            <input
              type="range"
              min={1}
              max={99}
              value={splitPercent}
              onChange={(e) => setSplitPercent(Number(e.target.value))}
            />
          )}

          {(payoutChoice === "donate" || payoutChoice === "split") && (
            <select
              value={charity ?? ""}
              onChange={(e) => setCharity(e.target.value)}
              className="rounded-xl px-4 py-2 bg-white/90 outline-none"
            >
              <option value="" disabled>
                Select charity
              </option>
              <option value="cancer_research">Cancer Research</option>
              <option value="doctors_without_borders">
                Doctors Without Borders
              </option>
            </select>
          )}
        </div>

{/* ================= SUBMIT RULES TEXT ================= */}
{submitState === "ready" && (
  <div
    className="
      absolute
      left-1/2
      top-[20%]
      -translate-x-[80%]
      max-w-xs
      text-center
      text-sm
      leading-relaxed
      text-black/70
      bg-white/70
      backdrop-blur
      rounded-xl
      px-4
      py-5
      shadow-md
      z-30
    "
  >
    By submitting your image, you agree to the CancerCulture rules.
    <br />
    <br />
    Each verified Discord account may upload one image per voting cycle.
  </div>
)}

        {/* ================= SUBMIT CANCER CELL ================= */}
        <div
          className={`
            absolute
    bottom-[-200px]
    left-[40%]
    -translate-x-1/2
            transition-transform duration-200
            ${
              submitState === "ready"
                ? "cursor-pointer hover:scale-105"
                : "cursor-default"
            }
          `}
          onClick={handleSubmit}
        >
          <Image
            src={submitImage}
            alt="Submit cancer cell"
            width={260}
            height={260}
            priority
          />
        </div>
      </div>

      {/* ================= HIDDEN FILE INPUT ================= */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFileChange}
      />
    </div>
  );
}
