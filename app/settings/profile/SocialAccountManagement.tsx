"use client";

import { useEffect, useRef, useState } from "react";
import type { OwnSocialAccountIdentity, VerifiedSocialProvider } from "@/lib/socials/socialAccountIdentities.server";
import type { SocialAccountVisibility } from "@/lib/socials/socialAccountManagement.server";

type Settings = {
  identities: readonly OwnSocialAccountIdentity[];
  visibility: SocialAccountVisibility;
  linkingUnlocked: boolean;
  providers: { tiktok: { connectAvailable: boolean } };
};
type Change = { path: string; method: "DELETE" | "PATCH"; body: Record<string, unknown> };
const providers: { id: VerifiedSocialProvider; label: string }[] = [
  { id: "tiktok", label: "TikTok" }, { id: "youtube", label: "YouTube" }, { id: "x", label: "X" },
  { id: "instagram", label: "Instagram" }, { id: "facebook", label: "Facebook" },
];
const button = "inline-flex min-h-11 items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold transition hover:border-[var(--orange-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--orange-main)] disabled:cursor-not-allowed disabled:opacity-40";
const tiktokResults: Record<string, string> = {
  connected: "TikTok ownership verified. Choose separately where the account may appear.",
  cancelled: "TikTok authorization was cancelled. Nothing was connected.",
  expired: "The TikTok connection request expired. Start a new ownership check.",
  missing_scope: "TikTok did not grant the profile access required to verify ownership.",
  invalid_identity: "TikTok returned profile information that could not be verified safely.",
  conflict: "The TikTok account or your social settings changed. Review the latest state before trying again.",
  session: "Your CancerCulture session changed or expired. Sign in again before connecting TikTok.",
  unavailable: "We could not confirm the TikTok result. Refresh the latest account state before trying again.",
  invalid: "The TikTok return could not be verified. Start a new ownership check.",
};

function consumeTikTokReturnMessage() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("social") !== "tiktok") return "";
  const message = tiktokResults[url.searchParams.get("result") ?? ""] ?? tiktokResults.invalid;
  url.searchParams.delete("social");
  url.searchParams.delete("result");
  url.hash = "connected-social-accounts";
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return message;
}

export default function SocialAccountManagement() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<Change | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(false);

  async function readCurrent() {
    const response = await fetch("/api/profile/social-accounts", { cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 401 ? "Sign in again to manage your social accounts." :
      "Your social account settings could not be loaded. Please try again.");
    const data: Settings = await response.json();
    if (mounted.current) setSettings(data);
  }
  async function refresh() {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage(""); setConfirm(null);
    try { await readCurrent(); setFailed(false); setPending(null); }
    catch (error) { setFailed(true); setMessage((error as Error).message); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const returnedMessage = consumeTikTokReturnMessage();
    async function load() {
      try {
        const response = await fetch("/api/profile/social-accounts", { cache: "no-store" });
        if (!response.ok) throw new Error("Your social account settings could not be loaded. Please try again.");
        const data: Settings = await response.json();
        if (!cancelled) { setSettings(data); setFailed(false); setMessage(returnedMessage); }
      } catch (error) { if (!cancelled) { setFailed(true); setMessage((error as Error).message); } }
      finally { if (!cancelled) setBusy(false); }
    }
    void load();
    return () => { cancelled = true; mounted.current = false; };
  }, []);

  async function change(request: Change) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage(""); setConfirm(null); setPending(request);
    try {
      const response = await fetch(request.path, { method: request.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.body), cache: "no-store" });
      if (response.ok) {
        // Routes return a fresh read after the RPC, never its historical receipt.
        const data: Settings = await response.json();
        if (mounted.current) { setSettings(data); setPending(null); setFailed(false); setMessage("Social account settings updated."); }
      } else if (response.status < 500) {
        setPending(null);
        await readCurrent();
        setFailed(false);
        setMessage(response.status === 409 ? "Your accounts or settings changed. The latest settings are shown; review them before trying again." :
          "This change could not be completed. Review your current settings and try again.");
      } else throw new Error("unavailable");
    } catch {
      if (mounted.current) { setFailed(true); setMessage("We could not confirm the change. Retry the same change safely, or reload your current settings."); }
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  function visibilityChange(scope: "profile" | "submissions", value: boolean) {
    if (!settings || busy || failed || pending) return;
    void change({ path: "/api/profile/social-visibility", method: "PATCH", body: {
      scope, value, expectedVersion: settings.visibility.version, requestId: crypto.randomUUID(),
    } });
  }

  async function startTikTok() {
    if (!settings || locked.current || busy || failed || pending || !settings.linkingUnlocked ||
      !settings.providers.tiktok.connectAvailable) return;
    locked.current = true; setBusy(true); setMessage(""); setConfirm(null);
    let navigating = false;
    try {
      const response = await fetch("/api/profile/social-accounts/tiktok/start", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 409) {
          await readCurrent();
          setMessage("Your TikTok account state changed. Review the latest state before trying again.");
          return;
        }
        throw new Error("unavailable");
      }
      const data = await response.json() as { authorizeUrl?: unknown };
      if (Object.keys(data).length !== 1 || typeof data.authorizeUrl !== "string") throw new Error("unavailable");
      const authorize = new URL(data.authorizeUrl);
      if (authorize.protocol !== "https:" || authorize.hostname !== "www.tiktok.com" ||
        authorize.pathname !== "/v2/auth/authorize/" || authorize.username || authorize.password) {
        throw new Error("unavailable");
      }
      navigating = true;
      window.location.assign(authorize.href);
    } catch {
      if (mounted.current) {
        // A provider start failure does not make the already loaded account
        // settings untrustworthy. Keep the action retryable.
        setFailed(false);
        setMessage("TikTok ownership verification could not be started. Refresh your settings before trying again.");
      }
    } finally {
      locked.current = false;
      if (mounted.current && !navigating) setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6" aria-busy={busy}>
      <section aria-labelledby="connected-social-accounts" className="rounded-2xl border border-white/10 bg-black/35 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="connected-social-accounts" className="font-[Permanent_Marker] text-xl tracking-wide text-[var(--orange-main)]">Connected social accounts</h3>
          <button type="button" className={button} disabled={busy} onClick={() => void refresh()}>Refresh</button>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/65">
          Manage your verified accounts and choose where they appear.
        </p>
        <div role="status" aria-live="polite" className="mt-3 text-sm leading-relaxed text-white/80">
          {busy ? (settings ? "Updating your settings…" : "Loading your social accounts…") : message}
        </div>
        {pending && !busy ? <button className={`${button} mt-3`} type="button" onClick={() => void change(pending)}>Retry same change</button> : null}
        {!busy && !settings && failed ? <p className="mt-3 text-sm text-white/65">Account and visibility information is unavailable. Use Refresh to try again.</p> : null}
        {settings ? <>
          {settings.identities.length === 0 ? <p className="mt-4 text-sm text-white/80">You have no connected social accounts yet.</p> : null}
          <div className="mt-4 divide-y divide-white/10">
            {providers.map(provider => {
              const account = settings.identities.find(item => item.provider === provider.id);
              const disabled = busy || failed || Boolean(pending);
              const canStartTikTok = provider.id === "tiktok" && settings.linkingUnlocked && settings.providers.tiktok.connectAvailable;
              return <div key={provider.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-[Permanent_Marker] text-lg tracking-wide text-[var(--orange-main)]">{provider.label}</h4>
                      <span className={`rounded-full border px-2.5 py-1 text-xs ${account?.state === "active" ? "border-emerald-400/30 text-emerald-200" : "border-white/15 text-white/60"}`}>
                        {!account ? "Not connected" : account.state === "active" ? "Connected · ownership verified" : account.state === "disconnected" ? "Disconnected" : "Verification revoked"}
                      </span>
                    </div>
                    {account ? <p className="mt-2 break-words text-sm text-white/75">
                      <a href={account.url} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-4">{account.displayLabel}</a>
                    </p> : null}
                    {account && account.state !== "active" ? <p className="mt-2 text-sm text-white/60">This connection is inactive. Reconnecting requires a new ownership check.</p> : null}
                    {provider.id === "tiktok" && account?.state !== "active" && !settings.linkingUnlocked ?
                      <p className="mt-2 text-sm text-white/60">Complete five eligible Cycles to unlock TikTok ownership verification.</p> : null}
                    {provider.id === "tiktok" && account?.state !== "active" && settings.linkingUnlocked && !settings.providers.tiktok.connectAvailable ?
                      <p className="mt-2 text-sm text-white/60">TikTok ownership verification is unavailable until the secure provider setup is complete.</p> : null}
                  </div>
                  {account?.state === "active" ? <button type="button" disabled={disabled} className={`${button} shrink-0`} onClick={() => setConfirm(account.identityId)}>Disconnect {provider.label}</button> :
                    provider.id === "tiktok" ? <button type="button" disabled={disabled || !canStartTikTok} className={`${button} shrink-0`} onClick={() => void startTikTok()}>
                      {account ? "Reconnect TikTok" : "Connect TikTok"}
                    </button> : null}
                </div>
                {account && confirm === account.identityId ? <div className="mt-3 rounded-xl border border-orange-400/25 bg-orange-400/5 p-4">
                  <p className="text-sm leading-relaxed">Disconnect {account.displayLabel} from CancerCulture? Reconnecting requires a new ownership check.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className={button} disabled={disabled} type="button" onClick={() => void change({ path: "/api/profile/social-accounts", method: "DELETE", body: {
                      identityId: account.identityId, expectedVersion: account.version, requestId: crypto.randomUUID(),
                    } })}>Confirm disconnect</button>
                    <button className={button} type="button" onClick={() => setConfirm(null)}>Cancel</button>
                  </div>
                </div> : null}
              </div>;
            })}
          </div>
        </> : null}
      </section>
      <section aria-labelledby="social-visibility-title" className="rounded-2xl border border-white/10 bg-black/35 p-5 sm:p-6">
        <h3 id="social-visibility-title" className="font-[Permanent_Marker] text-xl tracking-wide text-[var(--orange-main)]">Social account visibility</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/65">Choose where your connected, verified accounts may appear. These choices save separately.</p>
        {settings ? <>
          <div className="mt-4 space-y-3">
            {([['profile', 'Show on my public profile'], ['submissions', 'Show with my Submissions']] as const).map(([scope, label]) => <label key={scope} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-white/10 p-4">
              <input type="checkbox" checked={settings.visibility[scope]} disabled={busy || failed || Boolean(pending) || (!settings.visibility[scope] && !settings.visibility.canEnable)}
                onChange={event => visibilityChange(scope, event.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--orange-main)]" />
              <span className="text-sm">{label}</span>
            </label>)}
          </div>
          {!settings.visibility.canEnable ? <p className="mt-3 text-sm leading-relaxed text-white/60">To turn visibility on, unlock social account linking and connect at least one verified account. You can still turn an existing choice off.</p> : null}
        </> : <p className="mt-4 text-sm text-white/60">{busy ? "Loading visibility settings…" : "Visibility settings are unavailable."}</p>}
      </section>
    </div>
  );
}
