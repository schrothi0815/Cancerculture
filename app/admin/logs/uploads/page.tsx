"use client";

import { useEffect, useState } from "react";

type UploadLog = {
  id: number;
  created_at: string;
  cycle_id: number | null;
  status: string;
  reason: string | null;
};

export default function AdminUploadLogsPage() {
  const [logs, setLogs] = useState<UploadLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLogs() {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/logs/uploads");
        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            data.error || "Failed to load upload logs"
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

  if (loading) return <p>Loading upload logs…</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Admin – Upload Logs</h1>

      <div style={{ marginTop: 24 }}>
        {logs.length === 0 && (
          <p>No upload logs found.</p>
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
            <div>
              <strong>{log.status.toUpperCase()}</strong>
              {log.cycle_id && (
                <> – Cycle #{log.cycle_id}</>
              )}
            </div>

            {log.reason && (
              <div style={{ color: "#aaa" }}>
                Reason: {log.reason}
              </div>
            )}

            <div style={{ opacity: 0.6 }}>
              {new Date(log.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
