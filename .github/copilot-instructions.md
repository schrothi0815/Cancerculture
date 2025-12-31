# Copilot / AI Agent Instructions — CancerCulture

Purpose: give AI coding agents the focused context needed to be productive in this Next.js repo.

- **Big picture**: This is a Next 16 app-router project (React 19) using the `app/` directory. UI lives in `app/` and small server API endpoints live under `app/api/` (Route Handlers using `route.ts`). Static assets are in `public/` and styles use Tailwind (`globals.css`).

- **Key flows & integration points**:
  - Discord OAuth: client redirect handled in `app/api/auth/discord/route.ts`; callback exchange + cookie is in `app/api/auth/discord/callback/route.ts` (sets `discord_user_id` cookie and redirects to `/upload?verified=1`). Use this file to understand auth flows.
  - File uploads: `app/api/upload/route.ts` posts images to Cloudinary using `cloudinary.v2.uploader.upload_stream`. It expects `multipart/form-data` with a `file` field and returns `{ url, public_id }` on success.
  - Client cells: `app/components/DiscordCell.tsx` and `TelegramCell.tsx` are `"use client"` components handling UI/hover behaviour and external links.

- **Environment & secrets (required to run/test)**:
  - `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` (Discord OAuth)
  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (Cloudinary uploads)
  - Many server routes assume these are present — check `app/api/upload/route.ts` and `app/api/auth/discord/callback/route.ts` for usage.

- **Developer workflows / commands**:
  - Start dev: `npm run dev` (uses `next dev`).
  - Build: `npm run build`; Start prod server: `npm run start`.
  - Lint: `npm run lint` (uses `eslint`).

- **Project-specific conventions & patterns**:
  - App Router: prefer files under `app/` and use `route.ts` handlers for server API endpoints (exports like `export async function GET(req)` / `POST`).
  - Server-only code belongs in `route.ts` (uses `NextResponse` from `next/server`). Do not add browser-only code in those files.
  - Client components must include `"use client"` at top (see `DiscordCell.tsx`).
  - Cookies: auth flow uses `response.cookies.set(...)` in the callback route; cookie options show expected security settings.
  - TypeScript strictness enabled via `tsconfig.json` — prefer explicit types.
  - Path alias: `@/*` maps to repo root (see `tsconfig.json`). Use it when helpful.

- **Files to inspect first when making changes**:
  - `app/api/auth/discord/route.ts` and `app/api/auth/discord/callback/route.ts` — OAuth flow.
  - `app/api/upload/route.ts` — Cloudinary integration and expected form shape.
  - `app/layout.tsx`, `app/page.tsx`, `app/components/*` — UI patterns, Tailwind usage.
  - `package.json` — scripts and dependency versions (Next 16, React 19).

- **Examples / quick patterns**:
  - Redirect to Discord OAuth: build `URLSearchParams` and `NextResponse.redirect(...)` (see `app/api/auth/discord/route.ts`).
  - Exchange code for token: POST `application/x-www-form-urlencoded` to `https://discord.com/api/oauth2/token` and fetch `https://discord.com/api/users/@me` with `Authorization: Bearer <token>` (see callback route).
  - Cloudinary upload: convert `File` to buffer then use `cloudinary.uploader.upload_stream(...).end(buffer)` inside a Promise (see `app/api/upload/route.ts`).

- **When to ask the user**:
  - If changes require new env vars, confirm exact names/values and whether secrets should be committed to a secrets manager.
  - If modifying auth or upload behavior, ask whether to preserve the current cookie name (`discord_user_id`) and redirect behaviour.

Keep responses concise and reference the exact files above when proposing code changes.
