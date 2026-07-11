-- RUMI migration 0007 — admin UPDATE on onboarding_responses
-- Run in the Supabase SQL editor on project eygxousnaylqzxzwqwwe.
-- MUST run AFTER 0001 (profiles.role) and 0003 (defines rumi_profile_role()).
--
-- WHY: 0003 gave admins/VAs SELECT on onboarding_responses but deliberately NO
-- update (it was "raw intake — select only"). Session 5.5 lets admins correct a
-- client's onboarding answers and paste a voice-note transcript from the admin
-- client-detail page. This adds the ONE missing policy, mirroring the
-- rumi_*_admin_update policies 0003 already created for strategies,
-- strategy_sections, content_ideas, scripts, and profiles.
--
-- ADDITIVE + SAFE:
--   • Permissive policy — ORs with the existing client own-row SELECT; no read
--     path changes, and clients still get NO update (they must not self-edit;
--     their answers feed strategy + script generation).
--   • Admin-only via the recursion-safe SECURITY DEFINER helper from 0003.
--   • Idempotent: drop-if-exists + create; the grant is a no-op if already held.
--   • No Cleo table/column/policy is dropped or altered.

begin;

-- onboarding_responses already has RLS enabled + the admin/VA SELECT policy
-- (0003). Grant UPDATE to authenticated (0003 only granted SELECT here) and add
-- the admin-only UPDATE policy.
grant update on public.onboarding_responses to authenticated;

drop policy if exists rumi_onboarding_responses_admin_update on public.onboarding_responses;
create policy rumi_onboarding_responses_admin_update on public.onboarding_responses
  for update to authenticated
  using      (public.rumi_profile_role() = 'admin')
  with check (public.rumi_profile_role() = 'admin');

commit;
