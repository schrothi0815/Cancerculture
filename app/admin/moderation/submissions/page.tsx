"use client";

import { useEffect, useState } from "react";

type Submission = {
  id: number;
  cycle_id: number;
  image_url: string;
  is_disqualified: boolean;
  created_at: string;
};

const RULE_VIOLATION_REASONS = [
  "spam",
  "nudity",
  "hate",
  "harassment",
  "misleading",
  "low_effort",
  "off_topic",
];

const ILLEGAL_CONTENT_REASONS = [
  "child_abuse",
  "terrorism",
  "extreme_violence",
  "illegal_drugs",
  "copyright_violation",
];

export default function AdminModerationSubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Moderation UI state
  const [openFor, setOpenFor] = useState<number | null>(null);
  const [disqualificationType, setDisqualificationType] =
    useState<"rule_violation" | "illegal_content">(
      "rule_violation"
    );
  const [reasonCode, setReasonCode] = useState("");
  const [reasonText, setReasonText] = useState("");

  async function loadSubmissions() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/submissions");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load submissions");
      }

      setSubmissions(data.submissions);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisqualify(id: number) {
    if (!reasonCode) {
      alert("Please select a reason");
      return;
    }

    const res = await fetch(
      `/api/admin/submissions/${id}/disqualify`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disqualificationType,
          reasonCode,
          reasonText: reasonText || null,
        }),
      }
    );

    if (!res.ok) {
      alert("Disqualify failed");
      return;
    }

    // Reset UI state
    setOpenFor(null);
    setReasonCode("");
    setReasonText("");

    await loadSubmissions();
  }

  async function handleReinstate(id: number) {
    const confirmed = confirm(
      "Are you sure you want to reinstate this submission?"
    );
    if (!confirmed) return;

    const res = await fetch(
      `/api/admin/submissions/${id}/reinstate`,
      { method: "POST" }
    );

    if (!res.ok) {
      alert("Reinstate failed");
      return;
    }

    await loadSubmissions();
  }

  useEffect(() => {
    loadSubmissions();
  }, []);

  if (loading) return <p>Loading submissions…</p>;
  if (error) return <p style={{ color: "red" }}>{error}</p>;

  return (
    <div style={{ padding: 24 }}>
      <h1>Admin – Moderation (Submissions)</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 16,
          marginTop: 24,
        }}
      >
        {submissions.map((s) => (
          <div
            key={s.id}
            style={{
              border: "1px solid #ccc",
              padding: 12,
              borderRadius: 6,
              background: s.is_disqualified
                ? "#fee"
                : "#f9f9f9",
            }}
          >
            <img
              src={s.image_url}
              alt=""
              style={{
                width: "100%",
                height: 150,
                objectFit: "cover",
                marginBottom: 8,
              }}
            />

            <div style={{ fontSize: 12 }}>
              Cycle #{s.cycle_id}
            </div>

            <div
              style={{
                fontWeight: "bold",
                color: s.is_disqualified ? "red" : "green",
                marginBottom: 8,
              }}
            >
              {s.is_disqualified ? "Disqualified" : "Active"}
            </div>

            {!s.is_disqualified ? (
              <>
                <button
                  style={{ cursor: "pointer" }}
                  onClick={() => setOpenFor(s.id)}
                >
                  Disqualify
                </button>

                {openFor === s.id && (
                  <div style={{ marginTop: 8 }}>
                    <div>
                      <label>Type</label>
                      <select
                        value={disqualificationType}
                        onChange={(e) =>
                          setDisqualificationType(
                            e.target.value as any
                          )
                        }
                      >
                        <option value="rule_violation">
                          Rule violation
                        </option>
                        <option value="illegal_content">
                          Illegal content
                        </option>
                      </select>
                    </div>

                    <div>
                      <label>Reason</label>
                      <select
                        value={reasonCode}
                        onChange={(e) =>
                          setReasonCode(e.target.value)
                        }
                      >
                        <option value="">
                          -- select --
                        </option>
                        {(disqualificationType ===
                        "rule_violation"
                          ? RULE_VIOLATION_REASONS
                          : ILLEGAL_CONTENT_REASONS
                        ).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label>Details (optional)</label>
                      <textarea
                        value={reasonText}
                        onChange={(e) =>
                          setReasonText(e.target.value)
                        }
                        rows={2}
                      />
                    </div>

                    <button
                      style={{ marginTop: 8 }}
                      onClick={() => handleDisqualify(s.id)}
                    >
                      Confirm Disqualify
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                style={{ cursor: "pointer" }}
                onClick={() => handleReinstate(s.id)}
              >
                Reinstate
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
