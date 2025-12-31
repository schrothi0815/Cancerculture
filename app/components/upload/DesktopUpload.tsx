"use client";

import HomeBlinkCell from "@/app/components/HomeBlinkCell";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";


/* ================= TYPES ================= */
type ScannerState = "idle" | "hover" | "uploading" | "done";
type PayoutChoice = "keep" | "donate" | "split";
type SubmitState = "idle" | "partial" | "ready";

const CHARITY_OPTIONS = [
  { value: "save_the_children", label: "Save the Children" },
  { value: "dogs_for_better_lives", label: "Dogs for Better Lives" },
  { value: "love_justice_international", label: "Love Justice International" },
  { value: "habitat_for_humanity", label: "Habitat for Humanity International" },
  { value: "convoy_of_hope", label: "Convoy of Hope" },
  { value: "sea_shepherd", label: "Sea Shepherd Conservation Society" },
  { value: "animals_asia", label: "Animals Asia Foundation" },
  { value: "all_gods_children", label: "All God's Children International" },
];



/* ================= COMPONENT ================= */
export default function UploadPage({
  showSupportLink,
}: {
  showSupportLink: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------- Final Upload ---------- */
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);

  /* ---------- Scanner / Upload ---------- */
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [blink, setBlink] = useState(false);

  /* ---------- Image ---------- */
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  /* ---------- Meta ---------- */
  const [xUsername, setXUsername] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [payoutChoice, setPayoutChoice] = useState<PayoutChoice | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [charity, setCharity] = useState<string | null>(null);
  const [customCharity, setCustomCharity] = useState("");

  /* ---------- BLINK ---------- */
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

  /* ---------- SCANNER IMAGE ---------- */
  const getScannerImage = () => {
    if (scannerState === "hover") return "/scanner-v3.png";
    if (scannerState === "done") return "/scanner-v4.png";

    if (scannerState === "uploading") {
      return blink ? "/scanner-v4.png" : "/scanner-v2.png";
    }

    return blink ? "/scanner-v1.png" : "/scanner-v2.png";
  };

  /* ---------- SUBMIT STATE ---------- */
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

  /* ---------- EVENTS ---------- */
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

  /* ---------- SUBMIT ---------- */
  const handleSubmit = async () => {
    if (submitState !== "ready" || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setScannerState("uploading");

      const formData = new FormData();
      formData.append("file", file!);
      formData.append("xUsername", xUsername);
      formData.append("walletAddress", walletAddress);
      formData.append("payoutChoice", payoutChoice!);
      formData.append("splitPercent", splitPercent.toString());
      if (charity === "other") {
  formData.append("charity", customCharity);
} else if (charity) {
  formData.append("charity", charity);
}

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/api/auth/discord/login";
          return;
        }

        alert(data.error || "Upload failed");
        setScannerState("idle");
        return;
      }

      setUploadDone(true);
      setScannerState("done");
    } catch (err) {
      console.error(err);
      alert("Upload failed. Please try again.");
      setScannerState("idle");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ================= RENDER ================= */
  return (
    <div className="relative w-full h-screen bg-orange-background overflow-hidden flex items-center justify-center">
      <div className="relative z-20 w-full max-w-6xl h-[520px]">

        {/* ===== LEFT SCANNER ===== */}
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
            />
          </div>
        </div>

        {/* ===== IMAGE PREVIEW (ORIGINAL POSITION) ===== */}
        {previewUrl && (
          <div
            className="
              absolute
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

        {/* ===== RIGHT PANEL ===== */}
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
  <div className="flex flex-col gap-2">
    <input
      type="range"
      min={1}
      max={99}
      value={splitPercent}
      onChange={(e) => setSplitPercent(Number(e.target.value))}
    />

    <div className="flex justify-between text-sm text-black/70 px-1">
      <span>
        You: <strong>{splitPercent}%</strong>
      </span>
      <span>
        Charity: <strong>{100 - splitPercent}%</strong>
      </span>
    </div>
  </div>
)}


          {(payoutChoice === "donate" || payoutChoice === "split") && (
  <div className="flex flex-col gap-2">
    <select
      value={charity ?? ""}
      onChange={(e) => {
        setCharity(e.target.value);
        if (e.target.value !== "other") {
          setCustomCharity("");
        }
      }}
      className="rounded-xl px-4 py-2 bg-white/90 outline-none"
    >
      <option value="" disabled>
        Select charity
      </option>

      {CHARITY_OPTIONS.map((org) => (
        <option key={org.value} value={org.value}>
          {org.label}
        </option>
      ))}

      <option value="other">Other</option>
    </select>

    {charity === "other" && (
      <input
        type="text"
        placeholder="Enter charity / organization"
        value={customCharity}
        onChange={(e) => setCustomCharity(e.target.value)}
        className="rounded-xl px-4 py-2 bg-white/90 outline-none"
      />
    )}
  </div>
)}

        </div>

        {/* ===== SUCCESS MESSAGE ===== */}
        {uploadDone && (
          <div
            className="
              absolute
              left-1/2
              top-[20%]
              -translate-x-[80%]
              max-w-xs
              text-center
              text-sm
              bg-white/80
              backdrop-blur
              rounded-xl
              px-5
              py-6
              shadow-lg
              z-30
              flex
              flex-col
              items-center
              gap-3
            "
          >
            <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white text-xl font-bold">
              ✓
            </div>

            <p>
              <strong>Submission received!</strong>
              <br />
              We’re happy you shared your creativity with CancerCulture.
            </p>
          </div>
        )}

        {/* ===== SUBMIT / HOME ===== */}
        {!uploadDone ? (
          <div
            className={`absolute bottom-[-200px] left-[40%] -translate-x-1/2 ${
              submitState === "ready" && !isSubmitting
                ? "cursor-pointer hover:scale-105"
                : "opacity-70"
            }`}
            onClick={handleSubmit}
          >
            <Image src={submitImage} alt="Submit" width={260} height={260} />
          </div>
        ) : (
          <div
            className="absolute bottom-[-200px] left-[40%] -translate-x-1/2 cursor-pointer hover:scale-105"
            onClick={() => (window.location.href = "/")}
          >
            <HomeBlinkCell />
          </div>
        )}

                {/* ===== SUPPORT LINK ===== */}
        {showSupportLink && (
  <a
    href="https://tally.so/r/7RLXOZ"
    target="_blank"
    rel="noopener noreferrer"
    className="
      absolute
      top-[-25px]
      right-[110px]
      z-30

      px-4
      py-2
      rounded-full

      bg-black/60
      text-white
      text-xs
      font-medium

      backdrop-blur
      border
      border-white/20

      hover:bg-black/80
      hover:scale-[1.03]
      transition
    "
  >
    Wallet / Participation Issue?
  </a>
)}



        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
