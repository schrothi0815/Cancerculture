"use client";

export default function CreateInviteButton() {
  async function createInvite() {
    try {
      const res = await fetch("/api/admin/invites/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          note: "mod invite",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to create invite");
        return;
      }

      alert(
        "Invite created:\n\n" +
          data.invite.invite_url
      );
    } catch (err) {
      alert("Request failed");
      console.error(err);
    }
  }

  return (
    <button
      onClick={createInvite}
      style={{
        padding: "8px 16px",
        cursor: "pointer",
        fontSize: 16,
      }}
    >
      ➕ Create Invite 
    </button>
  );
}
