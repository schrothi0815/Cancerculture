import Link from "next/link";
import SocialAccountManagement from "./SocialAccountManagement";
import { getSessionState } from "@/lib/auth/sessionState";
import {
  loadOwnSocialAccountLinkingStatus,
  type SocialAccountLinkingStatus,
} from "@/lib/socials/socialAccountLinkingStatus.server";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const session = await getSessionState();
  let status: SocialAccountLinkingStatus | null = null;
  if (session.status === "authenticated") {
    try {
      status = await loadOwnSocialAccountLinkingStatus(session.session.session_id);
    } catch {
      // An unavailable response must never look like a new account's progress.
    }
  }

  return (
    <section aria-labelledby="profile-settings-title">
      <h2 id="profile-settings-title" className="font-['Permanent_Marker'] text-3xl text-[var(--orange-main)]">
        Profile &amp; social accounts
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/65">
        Link verified social accounts to share more of your work. Linking is optional;
        Discord remains your CancerCulture sign-in.
      </p>
      <div className="mt-6 rounded-2xl border border-white/10 bg-black/35 p-5 sm:p-6">
        {session.status === "anonymous" ? (
          <>
            <h3 className="font-[Permanent_Marker] text-xl tracking-wide text-[var(--orange-main)]">Your social accounts</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              Sign in with Discord to see your progress toward social account linking.
            </p>
            <Link
              href="/api/auth/discord/login?state=/settings/profile"
              className="mt-5 inline-flex min-h-11 items-center rounded-lg border border-[var(--orange-main)] px-4 py-2 font-semibold text-[var(--orange-main)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange-main)]"
            >
              Sign in with Discord
            </Link>
          </>
        ) : session.status === "restricted" ? (
          <p role="status" className="text-sm leading-relaxed text-white/75">
            Social account settings are unavailable while your account is restricted.
          </p>
        ) : !status ? (
          <p role="status" className="text-sm leading-relaxed text-white/75">
            Your social account progress is temporarily unavailable. Please try again later.
          </p>
        ) : (
          <>
            <h3 className="font-[Permanent_Marker] text-xl tracking-wide text-[var(--orange-main)]">
              {status.unlocked ? "Social account linking unlocked" : "Your progress"}
            </h3>
            <p id="social-progress-label" className="mt-3 text-sm font-semibold text-white/90">
              {status.eligibleCycles} of 5 eligible Cycles completed
            </p>
            <progress
              aria-labelledby="social-progress-label"
              value={status.eligibleCycles}
              max={5}
              className="mt-3 h-3 w-full max-w-md accent-[var(--orange-main)]"
            />
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/65">
              A Cycle counts when it is finalized with at least one of your Submissions
              not disqualified. The five Cycles do not need to be consecutive, and
              votes, ranking and winning do not affect your progress.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-white/80">
              {status.unlocked
                ? "Your unlock is permanent. Manage your social accounts below."
                : status.eligibleCycles === 5
                  ? "Your progress is complete. Your linking status could not be confirmed. Refresh to check again."
                  : "Complete five eligible Cycles to unlock social account linking permanently."}
            </p>
          </>
        )}
      </div>
      {session.status === "authenticated" ? <SocialAccountManagement /> : null}
    </section>
  );
}
