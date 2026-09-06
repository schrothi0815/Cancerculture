export const COMMUNITY_FEED_DETAIL_KEYS = [
  "submissionId",
  "state",
  "cycleNumber",
  "author",
  "imageUrl",
  "mediaWidth",
  "mediaHeight",
  "createdAt",
  "cycleStartedAt",
  "cycleEndedAt",
  "finalizedAt",
  "finalVoteCount",
  "rankInCycle",
  "payout",
  "socialLinks",
] as const;

import { parsePublicPayoutDetails, type PublicPayoutDetails } from "@/lib/payouts/public";
import type { PublicSocialAccountIdentity } from "@/lib/socials/socialAccountIdentities.server";

export const COMMUNITY_FEED_DETAIL_AUTHOR_KEYS = [
  "publicProfileId",
  "displayName",
  "avatarUrl",
] as const;

export type CommunityFeedDetailAuthor = {
  publicProfileId: string;
  displayName: string;
  avatarUrl: string | null;
};

export type CommunityFeedDetail = {
  submissionId: number;
  state: "live" | "finalized";
  cycleNumber: number;
  author: CommunityFeedDetailAuthor | null;
  imageUrl: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  createdAt: string;
  cycleStartedAt: string | null;
  cycleEndedAt: string | null;
  finalizedAt: string | null;
  finalVoteCount: number | null;
  rankInCycle: number | null;
  payout: PublicPayoutDetails | null;
  socialLinks: readonly PublicSocialAccountIdentity[];
};

function requireSubmissionId(submissionId: number) {
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
    throw new TypeError("Invalid community Feed detail submission id");
  }

  return submissionId;
}

export function getCommunityFeedDetailHref(submissionId: number) {
  return `/spread/${requireSubmissionId(submissionId)}`;
}

export function getCommunityFeedCanonicalUrl(submissionId: number) {
  return new URL(
    getCommunityFeedDetailHref(submissionId),
    "https://cancerculture.fun",
  ).toString();
}

export function getCommunityFeedDetailMediaPath(submissionId: number) {
  return `/api/community-feed/detail/media/${requireSubmissionId(submissionId)}`;
}

export function getCommunityFeedDetailMediaUrl(submissionId: number) {
  return new URL(
    getCommunityFeedDetailMediaPath(submissionId),
    "https://cancerculture.fun",
  ).toString();
}

function isNullableCanonicalTimestamp(value: unknown) {
  return (
    value === null ||
    (typeof value === "string" &&
      !Number.isNaN(new Date(value).getTime()) &&
      new Date(value).toISOString() === value)
  );
}

function hasExactKeys(value: Record<string, unknown>) {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...COMMUNITY_FEED_DETAIL_KEYS].sort())
  );
}

function hasExactAuthorKeys(value: Record<string, unknown>) {
  return (
    JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...COMMUNITY_FEED_DETAIL_AUTHOR_KEYS].sort())
  );
}

const SOCIAL_URLS = {
  tiktok: /^https:\/\/www\.tiktok\.com\/@[A-Za-z0-9_][A-Za-z0-9_.]{0,63}$/u,
  youtube: /^https:\/\/www\.youtube\.com\/channel\/UC[A-Za-z0-9_-]{22}$/u,
  x: /^https:\/\/x\.com\/[A-Za-z0-9_]{1,15}$/u,
  instagram: /^https:\/\/www\.instagram\.com\/[A-Za-z0-9_][A-Za-z0-9_.]{0,63}$/u,
  facebook: /^https:\/\/www\.facebook\.com\/[A-Za-z0-9][A-Za-z0-9.]{0,99}$/u,
} as const;

function isPublicSocialLink(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const link = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(link).sort()) !==
      JSON.stringify(["displayLabel", "provider", "url"]) ||
    typeof link.provider !== "string" ||
    !Object.hasOwn(SOCIAL_URLS, link.provider) ||
    typeof link.displayLabel !== "string" ||
    link.displayLabel.trim().length === 0 ||
    Array.from(link.displayLabel).length > 100 ||
    typeof link.url !== "string"
  ) {
    return false;
  }

  return SOCIAL_URLS[
    link.provider as keyof typeof SOCIAL_URLS
  ].test(link.url);
}

function isCommunityFeedDetailAuthor(
  value: unknown
): value is CommunityFeedDetailAuthor {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !hasExactAuthorKeys(value as Record<string, unknown>)
  ) {
    return false;
  }

  const author = value as Record<string, unknown>;
  const publicProfileId = author.publicProfileId;
  const avatarPrefix =
    typeof publicProfileId === "string"
      ? `/profile/${encodeURIComponent(publicProfileId)}/avatar?v=`
      : null;

  return (
    typeof publicProfileId === "string" &&
    publicProfileId.trim() === publicProfileId &&
    publicProfileId.length > 0 &&
    typeof author.displayName === "string" &&
    author.displayName.trim() === author.displayName &&
    author.displayName.length > 0 &&
    (author.avatarUrl === null ||
      (typeof author.avatarUrl === "string" &&
        avatarPrefix !== null &&
        author.avatarUrl.startsWith(avatarPrefix) &&
        /^[a-f0-9]{16}$/u.test(author.avatarUrl.slice(avatarPrefix.length))))
  );
}

export function isCommunityFeedDetail(
  value: unknown
): value is CommunityFeedDetail {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !hasExactKeys(value as Record<string, unknown>)
  ) {
    return false;
  }

  const detail = value as Record<string, unknown>;
  const dimensionsAreValid =
    (detail.mediaWidth === null && detail.mediaHeight === null) ||
    (Number.isSafeInteger(detail.mediaWidth) &&
      Number(detail.mediaWidth) > 0 &&
      Number.isSafeInteger(detail.mediaHeight) &&
      Number(detail.mediaHeight) > 0);
  const resultIsValid =
    detail.state === "live"
      ? detail.finalizedAt === null &&
        detail.finalVoteCount === null &&
        detail.rankInCycle === null &&
        detail.author === null
      : detail.state === "finalized" &&
        typeof detail.finalVoteCount === "number" &&
        Number.isSafeInteger(detail.finalVoteCount) &&
        detail.finalVoteCount > 0 &&
        typeof detail.rankInCycle === "number" &&
        Number.isSafeInteger(detail.rankInCycle) &&
        detail.rankInCycle > 0 &&
        typeof detail.finalizedAt === "string" &&
        isNullableCanonicalTimestamp(detail.finalizedAt) &&
        (detail.author === null ||
          isCommunityFeedDetailAuthor(detail.author));
  const payoutIsValid = detail.payout === null || parsePublicPayoutDetails(detail.payout) !== null;
  const socialLinksAreValid =
    Array.isArray(detail.socialLinks) &&
    detail.socialLinks.length <= 5 &&
    detail.socialLinks.every(isPublicSocialLink) &&
    new Set(
      detail.socialLinks.map((link) =>
        typeof link === "object" && link !== null
          ? (link as Record<string, unknown>).provider
          : null
      )
    ).size === detail.socialLinks.length;

  return (
    Number.isSafeInteger(detail.submissionId) &&
    Number(detail.submissionId) > 0 &&
    Number.isSafeInteger(detail.cycleNumber) &&
    Number(detail.cycleNumber) > 0 &&
    (detail.imageUrl === null ||
      detail.imageUrl ===
        getCommunityFeedDetailMediaPath(Number(detail.submissionId))) &&
    dimensionsAreValid &&
    typeof detail.createdAt === "string" &&
    isNullableCanonicalTimestamp(detail.createdAt) &&
    isNullableCanonicalTimestamp(detail.cycleStartedAt) &&
    isNullableCanonicalTimestamp(detail.cycleEndedAt) &&
    payoutIsValid &&
    socialLinksAreValid &&
    resultIsValid
  );
}
