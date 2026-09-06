import type { PublicSocialAccountIdentity } from "@/lib/socials/socialAccountIdentities.server";
import { SocialLinkRow } from "./SocialUi";

export default function PublicProfileSocialsSection({ socials }: {
  socials: readonly PublicSocialAccountIdentity[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
      <h2 className="mb-4 text-xl font-[Permanent_Marker] text-[var(--orange-main)]">Socials</h2>
      {socials.length === 0 ? (
        <p className="text-sm text-gray-400">No public social accounts.</p>
      ) : (
        <div className="space-y-3">
          {socials.map(social => <SocialLinkRow key={social.provider} social={social} />)}
        </div>
      )}
    </div>
  );
}
