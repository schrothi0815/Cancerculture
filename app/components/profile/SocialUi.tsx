"use client";

import { SOCIAL_PLATFORM_META } from "@/lib/socials/platforms";
import Image from "next/image";
import type { PublicSocialAccountIdentity, VerifiedSocialProvider as SocialPlatform } from "@/lib/socials/socialAccountIdentities.server";

export function SocialPlatformBadge({
  platform,
  compact = false,
}: {
  platform: SocialPlatform;
  compact?: boolean;
}) {
  const meta = SOCIAL_PLATFORM_META[platform];

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border font-bold uppercase tracking-[0.18em] ${
        compact ? "h-6 min-w-6 px-1.5 text-[9px]" : "h-8 min-w-8 px-2 text-[11px]"
      } ${meta.accentClass}`}
      title={meta.label}
    >
      {meta.iconSrc ? (
        <Image
          src={meta.iconSrc}
          alt={`${meta.label} icon`}
          width={20}
          height={20}
          className={`${
            compact ? "h-3.5 w-3.5" : meta.iconSizeClass ?? "h-4 w-4"
          } object-contain`}
        />
      ) : (
        meta.iconText
      )}
    </span>
  );
}

export function CompactSocialLinks({
  username,
  socials,
  align = "start",
  className = "",
}: {
  username: string;
  socials: readonly PublicSocialAccountIdentity[];
  align?: "start" | "center";
  className?: string;
}) {
  if (socials.length === 0) return null;

  const centered = align === "center";

  return (
    <div
      className={`min-w-0 ${centered ? "text-center" : "text-left"} ${className}`}
    >
      <div className="break-words font-[Permanent_Marker] text-sm tracking-wide text-[var(--orange-main)]">
        Follow {username}
      </div>
      <div
        className={`mt-2 flex min-w-0 flex-wrap gap-2 ${
          centered ? "justify-center" : "justify-start"
        }`}
      >
        {socials.map((social) => (
          <a
            key={social.provider}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${SOCIAL_PLATFORM_META[social.provider].label} profile ${social.displayLabel}`}
            className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-[var(--orange-main)]/30 bg-black/30 px-2.5 py-1.5 transition hover:border-[var(--orange-main)]/65 hover:bg-[var(--orange-main)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange-main)]"
          >
            <SocialPlatformBadge platform={social.provider} compact />
            <span className="min-w-0 truncate font-[Permanent_Marker] text-xs tracking-wide text-[var(--orange-main)]">
              {social.displayLabel}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function SocialVerificationBadge({
  isVerified,
}: {
  isVerified: boolean;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
        isVerified
          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
          : "border-yellow-400/40 bg-yellow-500/10 text-yellow-200"
      }`}
    >
      {isVerified ? "Verified" : "Unverified"}
    </span>
  );
}

export function SocialLinkRow({
  social,
  showStatus = true,
}: {
  social: PublicSocialAccountIdentity;
  showStatus?: boolean;
}) {
  return (
    <a
      href={social.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-3 transition hover:border-[var(--orange-dark)]/40 hover:bg-white/5"
    >
      <SocialPlatformBadge platform={social.provider} />

      <div className="min-w-0 flex-1">
        <div className="break-words font-[Permanent_Marker] text-sm tracking-wide text-[var(--orange-main)]">
          {social.displayLabel}
        </div>
        <div className="truncate text-xs text-gray-400">
          {SOCIAL_PLATFORM_META[social.provider].label}
        </div>
      </div>

      {showStatus ? (
        <SocialVerificationBadge
          isVerified={true}
        />
      ) : null}
    </a>
  );
}
