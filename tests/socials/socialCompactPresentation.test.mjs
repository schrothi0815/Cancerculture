import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("compact social links use the requested responsive follow treatment", async () => {
  const socialUi = await source("app/components/profile/SocialUi.tsx");

  assert.match(socialUi, /export function CompactSocialLinks/u);
  assert.match(socialUi, /Follow \{username\}/u);
  assert.match(socialUi, /flex-wrap/u);
  assert.match(socialUi, /font-\[Permanent_Marker\]/u);
  assert.match(socialUi, /text-\[var\(--orange-main\)\]/u);
  assert.match(socialUi, /target="_blank"/u);
  assert.match(socialUi, /rel="noopener noreferrer"/u);
  assert.doesNotMatch(socialUi, />\s*Socials\s*</u);
});

test("public profile moves social links into its compact identity header", async () => {
  const page = await source("app/profile/[publicProfileId]/page.tsx");

  assert.match(page, /<CompactSocialLinks/u);
  assert.match(page, /username=\{profile\.currentDiscordUsername\}/u);
  assert.match(page, /socials=\{profile\.socialLinks\}/u);
  assert.match(page, /align="center"/u);
  assert.doesNotMatch(page, /PublicProfileSocialsSection/u);
});

test("history and both Walls use compact submission links instead of Socials cards", async () => {
  for (const path of [
    "app/cycle-history/CycleHistoryClient.tsx",
    "app/wall/fame/FameGrid.tsx",
    "app/wall/shame/ShameGrid.tsx",
  ]) {
    const component = await source(path);
    assert.match(component, /<CompactSocialLinks/u);
    assert.doesNotMatch(component, /SubmissionSocialLinks/u);
  }
});
