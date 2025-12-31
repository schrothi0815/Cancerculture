import crypto from "crypto";

const ROOT_SECRET = process.env.OWNER_HASH_SECRET;

if (!ROOT_SECRET) {
  throw new Error("OWNER_HASH_SECRET is not set");
}

/**
 * Cycle-spezifisches Secret ableiten
 */
function deriveCycleSecret(cycleId: number | string): Buffer {
  return crypto
    .createHmac("sha256", ROOT_SECRET as string)
    .update(`cycle:${cycleId}`)
    .digest();
}

/**
 * Owner-Hash erzeugen
 */
export function createOwnerHash(
  discordUserId: string,
  cycleId: number | string
): string {
  const cycleSecret = deriveCycleSecret(cycleId);

  return crypto
    .createHmac("sha256", cycleSecret)
    .update(discordUserId)
    .digest("hex");
}
