import { SocialLinkRow } from "@/app/components/profile/SocialUi";
import type { SubmissionSocialLink } from "@/lib/socials/getSubmissionSocialLinks";

export default function SubmissionSocialLinks({
  socials,
  title = "Socials",
  className = "",
}: {
  socials: readonly SubmissionSocialLink[];
  title?: string;
  className?: string;
}) {
  if (!socials.length) {
    return null;
  }

  return (
    <div className={`rounded-lg bg-white/5 p-3 ${className}`}>
      <div className="font-[Permanent_Marker] tracking-wide text-[var(--orange-main)]">
        {title}
      </div>

      <div className="mt-3 space-y-2">
        {socials.map((social) => (
          <SocialLinkRow
            key={social.provider}
            social={social}
          />
        ))}
      </div>
    </div>
  );
}
