-- 0009_scripts_status_tracking.sql
-- Session 4 — Script Studio.
--
-- Adds lightweight status tracking to the SHARED `scripts` table (Cleo's table,
-- 1500+ existing rows). Purely additive — no drop/rename/alter-drop.
--
-- Live-schema check before writing this (service role, 2026-07-11):
--   scripts already has: id, user_id, topic, content_type, hook_type, pillar,
--   audience_stage, length, additional_context, generated_script, created_at,
--   AND status (text) — every existing row's status is 'saved'.
-- So `status` is NOT re-created here. Script Studio's own statuses are
--   idea → drafted → filmed → published;
-- legacy 'saved' (and '' / null) rows are folded into 'drafted' in the app
-- (src/lib/scripts.ts normalizeStatus) WITHOUT rewriting the DB.
--
-- This migration only:
--   1. adds `updated_at` (backfilled from created_at),
--   2. keeps `updated_at` fresh via a trigger, so the app never has to set it.
--
-- It deliberately does NOT touch the shared `status` column (not even its
-- default): the app always inserts status explicitly ('drafted'), so there's
-- no reason to alter a Cleo column.
--
-- Idempotent and safe to re-run.

begin;

-- 1. updated_at column, backfilled to created_at for existing rows.
--    Added nullable first so the backfill only ever touches NULLs (idempotent
--    on re-run — it won't clobber a legitimately-updated row's timestamp).
alter table public.scripts
  add column if not exists updated_at timestamptz;

update public.scripts
  set updated_at = created_at
  where updated_at is null;

alter table public.scripts
  alter column updated_at set default now();

alter table public.scripts
  alter column updated_at set not null;

-- 2. Auto-maintain updated_at on UPDATE so the app can stay migration-agnostic.
create or replace function public.scripts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scripts_set_updated_at on public.scripts;
create trigger scripts_set_updated_at
  before update on public.scripts
  for each row
  execute function public.scripts_set_updated_at();

commit;
