import { redirect } from "next/navigation";
import { getTeamMember } from "@/lib/auth/guards";
import CycleControls from "./CycleControls";

export default async function AdminCyclesPage() {
  let member;

  try {
    member = await getTeamMember();
  } catch {
    redirect("/403");
  }

  const isAdmin = member.role === "admin";

  return (
    <div style={{ padding: 24 }}>
      <h1>Admin – Voting Cycles</h1>

      {isAdmin ? (
        <CycleControls />
      ) : (
        <p style={{ opacity: 0.7 }}>
          ⚠️ Only admins can start or end cycles.
        </p>
      )}
    </div>
  );
}
