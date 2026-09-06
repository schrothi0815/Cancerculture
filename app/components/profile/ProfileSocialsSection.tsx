import Link from "next/link";

export default function ProfileSocialsSection() {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
      <h2 className="mb-4 text-xl font-[Permanent_Marker] text-[var(--orange-main)]">My Socials</h2>
      <Link href="/settings/profile" className="inline-flex min-h-11 items-center rounded-lg border border-[var(--orange-main)] px-4 py-2 text-sm font-semibold text-[var(--orange-main)] hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        Manage social accounts
      </Link>
    </div>
  );
}
