"use client";

import { useEffect, useState } from "react";

type Filter = "all" | "disqualify" | "reinstate";

type ModerationLog = {
  id: number;
  created_at: string;

  actor_role: "admin" | "mod" | "system";
  actor_id: string;

  action: string;

  target_type: string;
  target_id: string;

  reason_code: string;
  reason_text: string | null;
};

export default function AdminModerationLogsPage() {
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ FILTER STATE MUSS HIER SEIN
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/logs/moderation");
        const text = await res.text();

        if (!text) {
          throw new Error("Empty response");
        }

        const data = JSON.parse(text);

        if (!res.ok) {
          throw new Error(
            data.error || "Failed to load moderation logs"
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

  if (loading) return <p>Loading moderation logs…</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  const filteredLogs = logs.filter((log) => {
    if (filter === "all") return true;
    if (filter === "disqualify")
      return log.action.includes("disqualify");
    if (filter === "reinstate")
      return log.action.includes("reinstate");
    return true;
  });

  return (
    <div style={{ padding: 24 }}>
      <h1>Admin – Moderation Logs</h1>

      {/* 🔽 FILTER BUTTONS */}
      <div style={{ marginTop: 16 }}>
        {(["all", "disqualify", "reinstate"] as Filter[]).map(
          (f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                marginRight: 8,
                padding: "6px 12px",
                cursor: "pointer",
                fontWeight: filter === f ? "bold" : "normal",
              }}
            >
              {f.toUpperCase()}
            </button>
          )
        )}
      </div>

      {filteredLogs.length === 0 && (
        <p style={{ marginTop: 24 }}>
          No moderation actions found.
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        {filteredLogs.map((log) => (
          <div
            key={log.id}
            style={{
              borderBottom: "1px solid #333",
              padding: "12px 0",
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
                  fontWeight: "bold",
                  color:
                    log.actor_role === "admin"
                      ? "#0af"
                      : "#fa0",
                }}
              >
                {log.actor_role.toUpperCase()}
              </span>

              <span>{log.action}</span>

              <span style={{ opacity: 0.7 }}>
                {log.target_type} #{log.target_id}
              </span>
            </div>

            <div style={{ marginTop: 4 }}>
              Reason:{" "}
              <strong>{log.reason_code}</strong>
            </div>

            {log.reason_text && (
              <div style={{ opacity: 0.8 }}>
                {log.reason_text}
              </div>
            )}

            {/* 🔗 DIREKTLINK ZUR SUBMISSION */}
            <div style={{ marginTop: 6 }}>
              <a
                href={`/admin/moderation/submissions?highlight=${log.target_id}`}
                style={{
                  fontSize: 12,
                  color: "#0af",
                  textDecoration: "underline",
                }}
              >
                View submission
              </a>
            </div>

            <div style={{ opacity: 0.5, marginTop: 4 }}>
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
