import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Render the real server component, replacing only its server dependencies.
const source = await readFile(new URL("../../app/settings/profile/page.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
  .replaceAll('"react/jsx-runtime"', JSON.stringify(new URL("../../node_modules/react/jsx-runtime.js", import.meta.url).href))
  .replaceAll('"next/link"', JSON.stringify(new URL("../../node_modules/next/link.js", import.meta.url).href))
  .replace('import SocialAccountManagement from "./SocialAccountManagement";', 'const SocialAccountManagement = () => null;')
  .replace('import { getSessionState } from "@/lib/auth/sessionState";', "const getSessionState = async () => state.session;")
  .replace(/import \{ loadOwnSocialAccountLinkingStatus,? \} from "@\/lib\/socials\/socialAccountLinkingStatus.server";/u,
    "const loadOwnSocialAccountLinkingStatus = async (id) => { state.calls.push(id); if (state.error) throw state.error; return state.status; };");
assert.doesNotMatch(compiled, /from "@\/lib\//u, "All server dependencies must be replaced before importing the fixture");
const { default: Page, state } = await import(`data:text/javascript;base64,${Buffer.from(
  'export const state = { calls: [], session: null, status: null, error: null };\n' + compiled,
).toString("base64")}`);
const sessionId = "123e4567-e89b-42d3-a456-426614174000";
async function render(session, status = null, error = null) {
  Object.assign(state, { session, status, error, calls: [] });
  return renderToStaticMarkup(await Page());
}
const authenticated = { status: "authenticated", session: { session_id: sessionId } };

test("anonymous and restricted profiles never request owner progress", async () => {
  const anonymous = await render({ status: "anonymous" });
  assert.match(anonymous, /href="\/api\/auth\/discord\/login\?state=\/settings\/profile"/u);
  assert.doesNotMatch(anonymous, /<progress/u);
  assert.deepEqual(state.calls, []);
  const restricted = await render({ status: "restricted" });
  assert.match(restricted, /unavailable while your account is restricted/u);
  assert.doesNotMatch(restricted, /<progress|href="\/api\/auth/u);
  assert.deepEqual(state.calls, []);
});

test("a failed status read shows unavailable rather than invented progress", async () => {
  const markup = await render(authenticated, null, new Error("private backend detail"));
  assert.match(markup, /temporarily unavailable/u);
  assert.doesNotMatch(markup, /<progress|private backend detail|0 of 5/u);
  assert.deepEqual(state.calls, [sessionId]);
});

test("0–4 progress, completed pending progress and permanent unlock stay distinct", async () => {
  for (let eligibleCycles = 0; eligibleCycles <= 5; eligibleCycles++) {
    const markup = await render(authenticated, { eligibleCycles, requiredCycles: 5, unlocked: false, unlockedAt: null });
    assert.match(markup, new RegExp(`value="${eligibleCycles}" max="5"`, "u"));
    assert.match(markup, /aria-labelledby="social-progress-label"/u);
    assert.doesNotMatch(markup, /Your unlock is permanent|<button/u);
    if (eligibleCycles === 5) assert.match(markup, /Your progress is complete/u);
  }
  const unlocked = await render(authenticated, { eligibleCycles: 5, requiredCycles: 5, unlocked: true, unlockedAt: "2026-09-05T00:00:00Z" });
  assert.match(unlocked, /Your unlock is permanent/u);
  assert.match(unlocked, /Manage your social accounts below/u);
  assert.doesNotMatch(unlocked, /coming soon|available soon|available later/iu);
  assert.doesNotMatch(unlocked, /<button|2026-09-05|123e4567/u);
});
