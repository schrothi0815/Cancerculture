import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../../app/privacy/page.tsx", import.meta.url),
  "utf8"
);

test("TikTok Sandbox privacy notice describes the bounded test flow", () => {
  assert.match(page, /TikTok Sandbox Privacy Notice/u);
  assert.match(page, /Discord for website sign-in/u);
  assert.match(page, /app-scoped account identifier/u);
  assert.match(page, /OAuth access and refresh tokens are not stored/u);
  assert.match(page, /does not automatically make the account visible/u);
  assert.match(page, /does not use this connection to sign a member into the website/u);
  assert.match(page, /before any public launch or TikTok Production review/iu);
  assert.match(page, /support@cancerculture\.fun/u);
  assert.match(page, /href="\/rules"/u);
});

test("TikTok Sandbox privacy notice does not claim a public release or expose operator details", () => {
  assert.doesNotMatch(page, /cancer-related memes/iu);
  assert.doesNotMatch(page, /street|postal|company registration|legal entity/iu);
});
