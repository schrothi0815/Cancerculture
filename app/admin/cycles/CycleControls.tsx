"use client";

import { useState } from "react";

export default function CycleControls() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function startCycle() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/cycles/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endsAt: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unknown error");
      }

      setMessage("✅ Cycle successfully started");
    } catch (err: any) {
      setMessage("❌ " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function endCycle() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/cycles/end", {
        method: "POST",
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) {
        throw new Error(data?.error || "Unknown error");
      }

      setMessage("🛑 Cycle finalization started");
    } catch (err: any) {
      setMessage("❌ " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // 🆕 MANUELLER WORKER-TRIGGER
  async function finalizeCyclesNow() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch(
        "/api/admin/cycles/finalize",
        {
          method: "POST",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unknown error");
      }

      if (data.processed === 0) {
        setMessage("ℹ️ No finished cycles to finalize");
      } else {
        setMessage(
          `🏁 Finalize worker executed (${data.processed} cycle(s))`
        );
      }
    } catch (err: any) {
      setMessage("❌ " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={startCycle}
        disabled={loading}
        style={{
          padding: "8px 16px",
          fontSize: 16,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Starting…" : "Start Cycle"}
      </button>

      <button
        onClick={endCycle}
        disabled={loading}
        style={{
          marginLeft: 12,
          padding: "8px 16px",
          fontSize: 16,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        End Cycle
      </button>

      {/* 🆕 FINALIZE BUTTON */}
      <button
        onClick={finalizeCyclesNow}
        disabled={loading}
        style={{
          marginLeft: 12,
          padding: "8px 16px",
          fontSize: 16,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        Finalize Cycles (Worker)
      </button>

      {message && (
        <p style={{ marginTop: 16 }}>{message}</p>
      )}
    </div>
  );
}
