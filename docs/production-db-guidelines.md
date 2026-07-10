# Production Database Guidelines

Rumi has **no separate database**. Every query, migration, seed, and script in
this repo runs against the **live production Supabase project
`eygxousnaylqzxzwqwwe`** — the *same* project that powers Cleo. There is no
staging clone. `.env.local`, the Vercel deployment, the ops scripts, and the SQL
editor all point at the one production database that real people depend on.

Read this before you touch data. The rules below are not style preferences —
each one exists because breaking it has a real, user-facing cost.

---

## The one rule that matters most

**Never set, change, reset, or sign in with credentials on an account you did
not create in your current working session.**

Every existing account belongs to a real person:

- `joe@fitlogicsystems.co.uk` — Joe (admin)
- `info@contentcoachhq.com` — Cleo / Content Coach HQ (admin)
- `businessconciergeagency@gmail.com` — admin
- every `@`-real client account in `profiles`

That includes not "just testing" a password reset, not calling
`auth.admin.updateUserById`, not `generateLink` against their email to "see if it
works", not signing in as them to reproduce a bug. **Resetting a real user's
password or session has already locked a real user out of production at least
once.** Do not be the second time.

When you need an authenticated session to test something, **create a disposable
user, use it, then delete it** (see [Testing safely](#testing-safely)).

---

## What is shared with Cleo

The project was Cleo's first. Rumi was layered on top without forking the
database, so these tables are **Cleo's and must keep working exactly as they do
today**:

| Table | Owner column | Notes |
|---|---|---|
| `profiles` | `id` | Shared identity table. Cleo + Rumi both read it. |
| `onboarding_responses` | `user_id` | Raw intake. |
| `strategies` | `user_id` | |
| `strategy_sections` | `user_id` | Denormalized `user_id`. |
| `content_ideas` | `client_id` | Owner column is `client_id`, **not** `user_id`. |
| `scripts` | `user_id` | |
| `videos`, `creators`, `configs` | `user_id = NULL` on every row | **Global** Cleo research/competitor data. No per-user ownership. `configs` currently has **RLS disabled**. |

Rumi's own tables (safe to change freely, within reason): `checkin_responses`,
`checkin_analysis`, and the `linked_user_id` / `account_status` columns added to
`profiles`.

**Guardrails:**

- Never `DROP`, `TRUNCATE`, `ALTER … DROP COLUMN`, or rename a Cleo table/column.
- Never drop or replace an existing Cleo RLS policy. Rumi's policies are
  **additive** — permissive policies `OR` together, so widening access for
  admins/VAs never narrows what a client could already read.
- Never add a per-user own-row policy to `videos`, `creators`, or `configs`.
  Their `user_id` is `NULL`, so an own-row filter would hide **every** row and
  break Cleo's research reads. This is deliberate — see the excluded-tables note
  in `sql/0003_admin_rls.sql`.
- `configs` has RLS **disabled** today (anon can read its single global row). Do
  not simply enable RLS with an own-row policy. If you must enable it, use the
  commented block at the foot of `sql/0003_admin_rls.sql` and decide first
  *how* Cleo reads it (service role vs. anon vs. authenticated).

---

## Two Supabase clients, two trust levels

| Client | Key | RLS | Use for |
|---|---|---|---|
| `createClient()` (`src/lib/supabase/server.ts`, `client.ts`) | anon key | **Enforced** | All normal user-facing reads/writes. The default. |
| `createAdminClient()` (`src/lib/supabase/admin.ts`) | service role key | **Bypassed entirely** | Privileged ops only: account creation, cron writes, admin-only mutations. |

### Service role = root. Treat it that way.

The service role key **ignores every RLS policy**. A query that would return one
row for a client returns *all* rows under the service role, and a bad `update`
or `delete` with a wrong (or missing) `.eq()` filter will silently rewrite or
wipe **every** row — Cleo's included.

- `createAdminClient` is `import "server-only"`. Never import it into a client
  component, never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser, never put
  it behind a `NEXT_PUBLIC_` var.
- Every service-role write **must** carry an explicit, correct owner filter
  (`.eq("id", userId)`, `.eq("user_id", …)`). No filter = whole table.
- Prefer the anon client + RLS wherever the operation is something the signed-in
  user is allowed to do. Reach for the service role only when RLS genuinely has
  to be bypassed.

### Never trust a client-supplied ID

Admin "View as client" passes `?as=<client_id>`. Resolve it **only** through
`getActiveClient()` (`src/lib/activeClient.ts`), which re-checks the caller's
session and refuses `?as=` unless the caller's profile is `admin`. Every server
action that accepts a `clientId` must re-validate through `getActiveClient()` —
never query directly on the ID the browser sent.

---

## Migrations

There is no migration framework. SQL files in `sql/` are **run by hand in the
Supabase SQL editor**, in numeric order, against production. Because of that:

- **Idempotent by default.** Use `create table if not exists`,
  `add column if not exists`, `create policy` guarded by
  `drop policy if exists`, `on conflict do nothing`. Every file must be safe to
  re-run.
- **Additive, not destructive.** Add columns/tables/policies. Do not drop or
  rewrite Cleo's objects (see [What is shared with Cleo](#what-is-shared-with-cleo)).
- **Wrap multi-statement changes in `begin; … commit;`** so a mid-run failure
  doesn't leave the schema half-migrated (see `sql/0003`).
- **Order matters and is documented in each file's header.** e.g. `0003` depends
  on `profiles.linked_user_id` + `role` from `0001`; run `0001 → 0002 → 0003`.
- **Confirm assumptions against the live schema before you run.** Anon-key probes
  can't see authenticated-role policies or triggers. Run
  `sql/introspect_rls.sql` and read the output first — it's the source of truth
  for which tables have RLS on, what policies exist, which triggers fire on
  `auth.users`, and the anon/authenticated grants. Do not assume; verify.
- **New numbered file per change.** Don't edit an already-applied migration to
  "fix" it in place — add the next file. The `sql/` history is a record of what
  was run.
- RLS-relevant helpers (`rumi_profile_role()`, `rumi_linked_user()`) are
  `security definer` to avoid infinite recursion when a policy on `profiles`
  sub-selects `profiles`. Keep that pattern if you add profile-dependent policies.

---

## Testing safely

Headless tests that need an authenticated page **must not** borrow a real
account. The pattern:

1. **Create a disposable user** — service role `createUser` (email pre-confirmed)
   or the seed pattern in `sql/0005_seed_dummy_checkins.sql`. Use an obviously
   fake, namespaced address so it can never collide with a real client:
   `something@rumi.test`. Prefer fixed UUIDs (like the seed file's
   `11111111-…` / `22222222-…`) so re-runs don't pile up duplicates.
2. **Use it** for whatever you're verifying.
3. **Delete it afterwards** — every seed/test artifact must ship with a cleanup
   block. `sql/0005` has one at the foot: delete from `checkin_analysis`,
   `checkin_responses`, `profiles`, then `auth.users`, in that order (children
   before parents, because of the FK to `auth.users`).

**Sanctioned harness for the strategy pipeline:** `scripts/e2e-strategy.mjs`
already implements this pattern against the fixed disposable identity
`e2e-strategy@rumi.test`. `--run` seeds fixture sections (no API cost), `--live`
proves the real `generate-strategy` path, and both share an idempotent
`--teardown` that also runs automatically if a seed half-fails, so orphaned rows
can't survive. Prefer running/extending it over hand-rolling a throwaway — the
Session-3 incident (a `+alias` of a real admin account, no cleanup) is exactly
what it prevents.

Rules for test data:

- **`@rumi.test` addresses only.** Never seed against a real email.
- **Clean up when done.** Don't leave test users, test check-ins, or elevated
  roles lying around in production.
- **Don't elevate a real account to test admin flows** — create a `@rumi.test`
  user and set its role instead.
- Deleting an `auth.users` row cascades where FKs are `on delete cascade`; where
  they aren't, delete children first (see the `0005` cleanup order).

---

## Account creation & elevation (the sanctioned paths)

Do account operations through the existing, reviewed code — not ad-hoc SQL
against `auth.users`:

- **Create a client account:** `createClientAccount()`
  (`src/app/actions/admin.ts`) — admin-only, get-or-creates the auth user with a
  **cryptographically random** password, upserts an active `client` profile
  **without ever overwriting an existing role** (so re-inviting an admin can't
  demote them), and emails a single-use set-password link via Resend.
- **Bootstrap an account from the CLI:**
  `node scripts/bootstrap-admin.mjs "email@example.com" "Full Name"` — same
  logic, for accounts that don't exist yet. **It sends a real email** via the
  project SMTP; run it deliberately.
- **Elevate to admin:** create the account first (above), *then* run
  `sql/0004_set_admins.sql`. The `update` touches 0 rows for an email that has no
  profile yet, so order matters.
- **Never** hand-write a random/guessable password onto a real account, and never
  reuse a password across accounts.
- **Soft-disable, don't delete, a real client:** set
  `profiles.account_status = 'inactive'` (the app shows a locked page and blocks
  data access). Reserve hard deletes for `@rumi.test` fixtures.

---

## Secrets

- `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` live in
  `.env.local` (git-ignored) and Vercel env vars. Only the anon key is safe in
  the browser; the service role key is server-only.
- `.gitignore` already excludes `.env`, `.env.local`, and
  `rumi-secrets-record.txt`. Never commit any of them, never paste a key into a
  migration, a comment, a commit message, or a PR body.
- If a key is ever exposed, rotate it in Supabase immediately — it grants full
  read/write over Cleo's production data too.

---

## Quick pre-flight checklist

Before running anything against the database, ask:

- [ ] Am I about to touch an account I didn't create this session? → **Stop.**
- [ ] Does this drop/alter/rename a Cleo table, column, or policy? → **Stop.**
- [ ] Is this an anon-client operation, or does it truly need the service role?
- [ ] If service role: does every write have a correct owner filter?
- [ ] Is the SQL idempotent and additive, and have I checked the live schema
      with `sql/introspect_rls.sql`?
- [ ] If I'm creating test data, is it `@rumi.test`, and does it have a cleanup
      block?
- [ ] Am I about to send a real email (invite / recovery / SMTP)? Is that
      intended?
