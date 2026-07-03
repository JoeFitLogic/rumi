-- RUMI migration 0003 — admin / VA / own-row RLS for Cleo's client tables
-- Run in the Supabase SQL editor on project eygxousnaylqzxzwqwwe.
-- MUST run AFTER 0001 (it depends on profiles.linked_user_id + role columns).
--
-- Goal: give Rumi's roles proper row access without changing what Cleo can
-- already read. Every policy below is PERMISSIVE and ADDITIVE — permissive
-- policies OR together, so a client's existing own-row read keeps working
-- byte-for-byte; we only widen access for admins and VAs. No Cleo policy is
-- dropped, and RLS is only ENABLED on tables that already filter by it
-- (verified: anon reads return 0 rows on all of these), so enabling is a
-- no-op there and never strands a row.
--
-- SCOPE — audited live 2026-07-03:
--   Client-owned tables (own-row column populated on every row) → full pattern:
--     strategies (user_id), strategy_sections (user_id), onboarding_responses
--     (user_id), content_ideas (client_id), scripts (user_id), profiles (id).
--   GLOBAL Cleo tables, DELIBERATELY EXCLUDED — videos, creators, configs have
--     user_id = NULL on 100% of rows (they're shared research/competitor data,
--     read by Cleo via the service role). A per-user own-row policy there would
--     hide every row and break Cleo. `configs` additionally has RLS DISABLED
--     today (anon can read its single global row). See the commented block at
--     the foot of this file — enable it only after deciding how configs is read.

begin;

-- ── Recursion-safe role helpers ──────────────────────────────────────────
-- A policy ON profiles that sub-selects profiles would recurse infinitely
-- (the sub-select re-triggers profiles' RLS). SECURITY DEFINER reads profiles
-- as the function owner, bypassing RLS, so admin/VA checks are recursion-free
-- and evaluated once per statement.
create or replace function public.rumi_profile_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.rumi_linked_user()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$ select linked_user_id from public.profiles where id = auth.uid() $$;

revoke all     on function public.rumi_profile_role()  from public, anon;
revoke all     on function public.rumi_linked_user()   from public, anon;
grant  execute on function public.rumi_profile_role()  to authenticated;
grant  execute on function public.rumi_linked_user()   to authenticated;

-- ── strategies ────────────────────────────────────────────────────────────
alter table public.strategies enable row level security;
grant select, update on public.strategies to authenticated;

drop policy if exists rumi_strategies_select on public.strategies;
create policy rumi_strategies_select on public.strategies
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.rumi_profile_role() = 'admin'
    or (public.rumi_profile_role() = 'va' and public.rumi_linked_user() = user_id)
  );

drop policy if exists rumi_strategies_admin_update on public.strategies;
create policy rumi_strategies_admin_update on public.strategies
  for update to authenticated
  using      (public.rumi_profile_role() = 'admin')
  with check (public.rumi_profile_role() = 'admin');

-- ── strategy_sections (denormalized user_id) ───────────────────────────────
alter table public.strategy_sections enable row level security;
grant select, update on public.strategy_sections to authenticated;

drop policy if exists rumi_strategy_sections_select on public.strategy_sections;
create policy rumi_strategy_sections_select on public.strategy_sections
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.rumi_profile_role() = 'admin'
    or (public.rumi_profile_role() = 'va' and public.rumi_linked_user() = user_id)
  );

drop policy if exists rumi_strategy_sections_admin_update on public.strategy_sections;
create policy rumi_strategy_sections_admin_update on public.strategy_sections
  for update to authenticated
  using      (public.rumi_profile_role() = 'admin')
  with check (public.rumi_profile_role() = 'admin');

-- ── onboarding_responses (raw intake — select only, no admin update) ───────
alter table public.onboarding_responses enable row level security;
grant select on public.onboarding_responses to authenticated;

drop policy if exists rumi_onboarding_responses_select on public.onboarding_responses;
create policy rumi_onboarding_responses_select on public.onboarding_responses
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.rumi_profile_role() = 'admin'
    or (public.rumi_profile_role() = 'va' and public.rumi_linked_user() = user_id)
  );

-- ── content_ideas (owner column is client_id, not user_id) ─────────────────
alter table public.content_ideas enable row level security;
grant select, update on public.content_ideas to authenticated;

drop policy if exists rumi_content_ideas_select on public.content_ideas;
create policy rumi_content_ideas_select on public.content_ideas
  for select to authenticated
  using (
    client_id = auth.uid()
    or public.rumi_profile_role() = 'admin'
    or (public.rumi_profile_role() = 'va' and public.rumi_linked_user() = client_id)
  );

drop policy if exists rumi_content_ideas_admin_update on public.content_ideas;
create policy rumi_content_ideas_admin_update on public.content_ideas
  for update to authenticated
  using      (public.rumi_profile_role() = 'admin')
  with check (public.rumi_profile_role() = 'admin');

-- ── scripts ────────────────────────────────────────────────────────────────
alter table public.scripts enable row level security;
grant select, update on public.scripts to authenticated;

drop policy if exists rumi_scripts_select on public.scripts;
create policy rumi_scripts_select on public.scripts
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.rumi_profile_role() = 'admin'
    or (public.rumi_profile_role() = 'va' and public.rumi_linked_user() = user_id)
  );

drop policy if exists rumi_scripts_admin_update on public.scripts;
create policy rumi_scripts_admin_update on public.scripts
  for update to authenticated
  using      (public.rumi_profile_role() = 'admin')
  with check (public.rumi_profile_role() = 'admin');

-- ── profiles (own row = id; admin sees/edits all; VA sees its linked client) ─
-- The admin SELECT-all is what powers the View-as-client switcher and admin
-- reads; without it those queries return only the admin's own row.
alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;

drop policy if exists rumi_profiles_select on public.profiles;
create policy rumi_profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.rumi_profile_role() = 'admin'
    or (public.rumi_profile_role() = 'va' and public.rumi_linked_user() = id)
  );

-- Admins manage accounts (role, account_status, name). Clients keep their own
-- update via any existing Cleo policy — this only ADDS admin reach.
drop policy if exists rumi_profiles_admin_update on public.profiles;
create policy rumi_profiles_admin_update on public.profiles
  for update to authenticated
  using      (public.rumi_profile_role() = 'admin')
  with check (public.rumi_profile_role() = 'admin');

commit;

-- ───────────────────────────────────────────────────────────────────────────
-- OPTIONAL — configs (and videos/creators) are GLOBAL Cleo tables with a NULL
-- user_id on every row. They have no per-client ownership, so the own-row / VA
-- pattern above does NOT apply. `configs` currently has RLS DISABLED (anon can
-- read its one row today). Do NOT simply enable RLS with an own-row policy —
-- that hides the global row and breaks Cleo's research reads.
--
-- If you want RLS ON for configs while preserving today's read access, run the
-- block below (it lets any signed-in user read the shared config, and revokes
-- the current anon read). Decide first HOW Cleo's frontend reads configs
-- (service role vs. anon vs. authenticated) — confirm with sql/introspect_rls.sql.
--
-- alter table public.configs enable row level security;
-- revoke select on public.configs from anon;
-- grant  select on public.configs to authenticated;
-- drop policy if exists rumi_configs_read_all on public.configs;
-- create policy rumi_configs_read_all on public.configs
--   for select to authenticated using (true);
