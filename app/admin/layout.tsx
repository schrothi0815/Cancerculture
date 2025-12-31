import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getTeamMember } from "@/lib/auth/guards";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  let member;

  try {
    // 🔐 Admin ODER Mod (Cookie + DB im Guard)
    member = await getTeamMember();
  } catch {
    redirect("/403");
  }

  const isAdmin = member.role === "admin";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 220,
          padding: 16,
          borderRight: "1px solid #333",
        }}
      >
        

        <ul style={{ listStyle: "none", padding: 0 }}>
          {/* 🔴 ADMIN ONLY */}
          {isAdmin && (
            <li>
              <Link href="/admin/cycles">Cycles</Link>
            </li>
          )}

          {/* 🟢 MOD + ADMIN */}
          <li>
            <Link href="/admin/moderation/submissions">
              Moderation
            </Link>
          </li>

          <li>
            <strong>Logs</strong>
          </li>

          <li style={{ marginLeft: 12 }}>
            <Link href="/admin/logs/cycles">
              Cycle Logs
            </Link>
          </li>

          <li style={{ marginLeft: 12 }}>
            <Link href="/admin/logs/uploads">
              Upload Logs
            </Link>
          </li>

          <li style={{ marginLeft: 12 }}>
            <Link href="/admin/logs/votes">
              Vote Logs
            </Link>
          </li>

          <li style={{ marginLeft: 12 }}>
            <Link href="/admin/logs/moderation">
              Moderation Logs
            </Link>
          </li>

          {isAdmin && (
  <li>
    <Link href="/admin/invites">
      📨 Invites
    </Link>
  </li>
)}
          {isAdmin && (
            <li>
  <Link href="/admin/mods">
    🛡️ Mods
  </Link>
</li>

          )}
          <Link
  href="/"
  style={{
    display: "inline-block",
    marginBottom: 16,
    padding: "6px 10px",
    borderRadius: 6,
    background: "transparent",
    color: "#fff",
    fontSize: 13,
    textDecoration: "none",
  }}
>
  ← Home
</Link>

        </ul>
      </nav>

      <main
  style={{
    flex: 1,
    padding: 24,
    overflowY: "auto",
    maxHeight: "100vh",
  }}
>
  {children}
</main>
    </div>
  );
}
