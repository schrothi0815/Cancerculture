"use client";

import { useEffect, useState } from "react";

type VoteLog = {
  id: number;
  created_at: string;
  cycle_id: number;
  submission_id: number;
  owner_hash: string;
  status: "accepted" | "rejected";
  reason: string | null;
};

export default function AdminVoteLogsPage() {
  const [logs, setLogs] = useState<VoteLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/logs/votes");
        const text = await res.text();

        if (!text) {
          throw new Error("Empty response from server");
        }

        const data = JSON.parse(text);

        if (!res.ok) {
          throw new Error(
            data.error || "Failed to load vote logs"
          );
        }

        setLogs(data.logs);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadLogs();
  }, []);

  if (loading) return <p>Loading vote logs…</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Admin – Vote Logs</h1>

      <div style={{ marginTop: 24 }}>
        {logs.length === 0 && (
          <p>No vote logs found.</p>
        )}

        {logs.map((log) => (
          <div
            key={log.id}
            style={{
              padding: 12,
              borderBottom: "1px solid #333",
              fontSize: 13,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: "bold",
                  background:
                    log.status === "accepted"
                      ? "#0a0"
                      : "#a00",
                  color: "#fff",
                }}
              >
                {log.status.toUpperCase()}
              </span>

              <span>
                Cycle #{log.cycle_id} – Submission #
                {log.submission_id}
              </span>
            </div>

            {log.reason && (
              <div style={{ color: "#aaa" }}>
                Reason: {log.reason}
              </div>
            )}

            <div style={{ opacity: 0.6 }}>
              {new Date(
                log.created_at
              ).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
