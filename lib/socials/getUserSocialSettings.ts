import "server-only";
import { loadOwnSocialAccountManagement } from "@/lib/socials/socialAccountManagement.server";
import type { VerifiedSocialProvider } from "@/lib/socials/socialAccountIdentities.server";

export type UserSocialSettings = {
  available: boolean;
  showSocialsOnSubmissions: boolean;
  socialCount: number;
  verifiedSocialCount: number;
  socialPlatforms: VerifiedSocialProvider[];
};

export async function getUserSocialSettings(sessionId: string): Promise<UserSocialSettings> {
  try {
    const { identities, visibility } = await loadOwnSocialAccountManagement(sessionId);
    const active = identities.filter(account => account.state === "active");
    return { available: true, showSocialsOnSubmissions: visibility.submissions,
      socialCount: active.length, verifiedSocialCount: active.length,
      socialPlatforms: active.map(account => account.provider) };
  } catch {
    // Social availability must not prevent participation or pretend to be an empty account.
    return { available: false, showSocialsOnSubmissions: false, socialCount: 0,
      verifiedSocialCount: 0, socialPlatforms: [] };
  }
}
