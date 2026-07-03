# Rumi

Personal brand operating system for coaches and their clients. Built by FitLogic Systems for Content That Converts.

Next.js 15 App Router · TypeScript · Tailwind · Supabase (shared project with Cleo) · Vercel · Anthropic server actions · Resend.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

## Environment variables

See `.env.example`. Supabase URL/anon key come from project `eygxousnaylqzxzwqwwe` (same as Cleo). The service role key is only used server-side (cron analysis, admin operations).

## One-time setup

1. **SQL migration** — run `sql/0001_rumi_foundation.sql` in the Supabase SQL editor. It adds `checkin_responses`, `checkin_analysis`, and the `linked_user_id` / `account_status` columns on `profiles`. Existing Cleo tables are untouched.
2. **Auth trigger** — confirm the `handle_new_user` trigger that inserts a `profiles` row on signup exists (it should, from Cleo). If not, new signups won't get a profile and the app shell will fail to resolve them.
3. **Supabase Auth URLs** — add the Rumi Vercel URL (and later the custom domain) to Auth → URL Configuration → Redirect URLs, including `/auth/callback`. Site URL currently points at Cleo; leave it until Rumi's domain is live.
4. **Resend SMTP** — already configured on the Supabase project (`updates.fitlogicsystems.co.uk`), so signup confirmations, magic links, and password resets work out of the box.

## Deploying to Vercel

Import `JoeFitLogic/rumi`, framework preset Next.js, add the env vars, deploy. Then set `NEXT_PUBLIC_SITE_URL` to the deployed URL.

## Architecture notes

- **Admin switcher** — Niamh, Alex, and Sara (role `admin`) get a "View as client" dropdown in the top bar. It sets `?as=<client_id>`, which is bookmarkable. Server-side resolution lives in `src/lib/activeClient.ts` and never trusts `?as=` unless the caller's profile is admin. Every future server action should accept a `clientId` and re-validate through `getActiveClient()` — never trust the client-supplied ID directly.
- **VA accounts** — `profiles.linked_user_id` points a VA at the client they work for; `getActiveClient()` resolves their data automatically.
- **Soft disable** — set `profiles.account_status = 'inactive'` to lock an account (shows a locked page, no data access through the shell).
- **No n8n for AI calls** — strategy generation, ideation synthesis, script generation, and check-in analysis are all Next.js server actions calling Anthropic directly. The SMAI competitor pipeline (Trigger.dev/Apify/Gemini) stays exactly as it is.
- **`?as=` in layouts** — layouts can't read search params, so middleware forwards the full URL in an `x-url` header (`src/lib/supabase/middleware.ts`) and the app shell parses it.

## Build phases

1. ✅ Foundation — repo, auth, design system, layout, admin switcher
2. Dashboard · My Strategy (12 sections) · Script Studio · Client Health & Admin
3. Check In (form + results) · Research (5-step flow) · Reddit scraper · embedded competitor research
4. Saturday cron analysis · transcript analyser · Instagram OAuth
5. Migrate Cleo clients one by one (Cleo stays live throughout)
