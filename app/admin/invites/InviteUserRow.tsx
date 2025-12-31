"use client";

type Props = {
  discordUserId: string;
  discordUsername?: string | null;
  role?: "admin" | "mod";
  createdAt: string;
};

export default function InviteUserRow({
  discordUserId,
  discordUsername,
  role,
  createdAt,
}: Props) {
  async function updateRole(action: "mod" | "remove") {
    await fetch("/api/admin/team/role", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetDiscordId: discordUserId,
        role: action,
      }),
    });

    window.location.reload();
  }

  return (
    <li
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        marginBottom: 6,
      }}
    >
      <div style={{ minWidth: 260 }}>
        <strong>
          {discordUsername ?? "Unknown User"}
        </strong>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          ID: {discordUserId}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {new Date(createdAt).toLocaleString()}
        </div>
      </div>

      {role === "admin" && <strong>(Admin)</strong>}

      {role === "mod" && (
        <>
          <strong>(Mod)</strong>
          <button
            style={{ padding: "4px 8px", cursor: "pointer" }}
            onClick={() => updateRole("remove")}
          >
            Remove Mod
          </button>
        </>
      )}

      {!role && (
        <button
          style={{ padding: "4px 8px", cursor: "pointer" }}
          onClick={() => updateRole("mod")}
        >
          Make Mod
        </button>
      )}
    </li>
  );
}
