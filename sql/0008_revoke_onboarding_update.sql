-- RUMI migration 0008 — revert 0007's onboarding UPDATE grant + admin policy
-- Run in the Supabase SQL editor on project eygxousnaylqzxzwqwwe.
-- Run AFTER 0007.
--
-- WHY: 0007 granted UPDATE on onboarding_responses to `authenticated` so admins
-- could edit answers via the anon client under an admin RLS policy. Verified
-- 2026-07-10 that this ALSO activated Cleo's pre-existing own-row UPDATE policy
-- for the `authenticated` role, letting a CLIENT edit their own onboarding row
-- at the DB level (own-row only — not a cross-client breach, but the raw grant
-- contradicts "clients do not self-edit; those answers feed generation").
--
-- FIX: admin onboarding/voice writes now go through the SERVICE ROLE
-- (createAdminClient, which bypasses RLS) with a mandatory .eq('user_id', …)
-- owner filter — so the authenticated UPDATE grant + admin policy are no longer
-- needed. Revoking them restores the EXACT pre-0007 grant state that Cleo has
-- always run under (Cleo writes onboarding once via the service role at intake
-- and has no client-side onboarding editor), so this cannot affect Cleo.
--
-- SAFE:
--   • Pure revert of 0007 — nothing here existed before 0007.
--   • Idempotent: REVOKE is a no-op if the privilege isn't held; DROP POLICY IF
--     EXISTS is a no-op if already gone. Safe to re-run.
--   • Cleo's own SELECT/own-row policies and the 0003 admin/VA SELECT policy are
--     untouched — reads are unchanged; only the authenticated UPDATE path closes.

begin;

-- Remove the admin-only UPDATE policy 0007 added (admin writes use the service
-- role now, which ignores RLS — so this policy has no remaining purpose).
drop policy if exists rumi_onboarding_responses_admin_update on public.onboarding_responses;

-- Revoke the UPDATE privilege 0007 granted, closing the authenticated (client)
-- write path and restoring the pre-0007 grant state.
revoke update on public.onboarding_responses from authenticated;

commit;
