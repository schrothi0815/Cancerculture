import type { Metadata } from "next";
import Link from "next/link";
import PageWrapper from "@/app/components/ui/PageWrapper";

export const metadata: Metadata = {
  title: "TikTok Sandbox Privacy Notice | CancerCulture",
  description:
    "Privacy information for invited testers using the CancerCulture TikTok Sandbox connection.",
};

const sections = [
  {
    title: "Scope of this notice",
    paragraphs: [
      "This notice applies only to invited testers who choose to connect a TikTok profile to an authenticated CancerCulture test account through TikTok Sandbox. It does not describe a public release of the TikTok integration.",
      "CancerCulture continues to use Discord for website sign-in. TikTok authorization is used only to verify control of the selected TikTok account and create an optional social-profile connection.",
    ],
  },
  {
    title: "Data used for the connection",
    paragraphs: [
      "TikTok provides an app-scoped account identifier, display name, username, and profile link after the tester grants the requested permissions. CancerCulture validates these values and retains only the app-scoped identifier, normalized username, public @username label, connection status and timestamps, and security or audit records associated with the existing CancerCulture account.",
      "OAuth access and refresh tokens are not stored. The access token exists only briefly in server memory while the profile is verified, is submitted for revocation on a best-effort basis, and is then discarded.",
    ],
  },
  {
    title: "Purpose and visibility",
    paragraphs: [
      "The data is used to verify account ownership, prevent conflicting or duplicate connections, support disconnect and reconnect actions, and protect the integrity of the test flow.",
      "Connecting TikTok does not automatically make the account visible. The username and profile link can appear on public CancerCulture surfaces only after the member separately enables the applicable visibility preference.",
      "CancerCulture does not use this connection to sign a member into the website, publish to TikTok, read videos, comments or private messages, follow accounts, build advertising profiles, or sell personal data.",
    ],
  },
  {
    title: "Service providers and TikTok",
    paragraphs: [
      "Data is handled only by CancerCulture and infrastructure providers needed to operate, secure, and store the test service. TikTok separately processes the authorization interaction under its own terms and privacy information.",
    ],
  },
  {
    title: "Retention and tester controls",
    paragraphs: [
      "An active connection remains available until the tester disconnects it or the closed test data is reset. Disconnecting removes the account from active and public display. Limited technical history may remain during the test phase for security, integrity, conflict prevention, and audit purposes.",
      "Before any public launch or TikTok Production review, CancerCulture will replace this sandbox-specific notice with the final privacy information and retention terms for the released service.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <PageWrapper>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-18 pt-8 sm:px-6 sm:pb-24 sm:pt-12">
        <header className="relative overflow-hidden rounded-[30px] border border-[rgba(255,220,180,0.38)] bg-[linear-gradient(145deg,rgba(255,137,58,0.94),rgba(226,88,29,0.94))] px-6 py-8 text-[#1a0b05] shadow-[0_18px_45px_rgba(0,0,0,0.38)] sm:px-9 sm:py-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,240,200,0.28),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(0,0,0,0.18),transparent_45%)]" />
          <div className="relative">
            <p className="font-['Permanent_Marker'] text-sm uppercase tracking-[0.2em] text-[rgba(26,11,5,0.72)]">
              Closed development test
            </p>
            <h1 className="mt-3 font-['Permanent_Marker'] text-4xl leading-tight text-[#140803] sm:text-5xl">
              TikTok Sandbox Privacy Notice
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-[rgba(26,11,5,0.85)] sm:text-[1.05rem]">
              This notice explains the limited TikTok data processing used by
              invited CancerCulture testers during the closed Sandbox phase.
            </p>
          </div>
        </header>

        <div className="space-y-5">
          {sections.map((section, index) => (
            <section
              key={section.title}
              className={`rounded-[24px] border p-6 text-[rgba(43,18,8,0.9)] shadow-[0_16px_34px_rgba(0,0,0,0.18)] sm:p-8 ${
                index % 2 === 0
                  ? "border-[rgba(255,232,196,0.56)] bg-[linear-gradient(180deg,rgba(255,156,76,0.95),rgba(239,104,38,0.93))]"
                  : "border-[rgba(255,228,180,0.5)] bg-[linear-gradient(180deg,rgba(255,197,108,0.94),rgba(255,148,64,0.92))]"
              }`}
            >
              <h2 className="font-['Permanent_Marker'] text-2xl tracking-[0.04em] text-[#2b1208] sm:text-[1.8rem]">
                {section.title}
              </h2>
              <div className="mt-4 space-y-4 text-base leading-7 sm:text-[1.05rem]">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="rounded-[24px] border border-[rgba(255,232,196,0.56)] bg-[linear-gradient(180deg,rgba(255,196,112,0.95),rgba(255,147,67,0.92))] p-6 text-[rgba(43,18,8,0.9)] shadow-[0_12px_30px_rgba(0,0,0,0.14)] sm:p-8">
          <h2 className="font-['Permanent_Marker'] text-2xl text-[#2b1208]">
            Contact and current test terms
          </h2>
          <p className="mt-4 leading-7">
            Testers can disconnect TikTok in their profile settings or contact{" "}
            <a
              className="font-semibold underline decoration-2 underline-offset-4"
              href="mailto:support@cancerculture.fun"
            >
              support@cancerculture.fun
            </a>{" "}
            about the test connection or its data. The currently applicable
            closed-test participation rules are available on the{" "}
            <Link
              className="font-semibold underline decoration-2 underline-offset-4"
              href="/rules"
            >
              Rules page
            </Link>
            .
          </p>
          <p className="mt-4 text-sm leading-6">
            Effective date: 6 September 2026
          </p>
        </section>
      </main>
    </PageWrapper>
  );
}
