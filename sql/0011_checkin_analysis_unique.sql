-- 0011_checkin_analysis_unique.sql
-- Session 6 — Saturday check-in analysis cron.
--
-- One additive change to the Rumi-owned `checkin_analysis` table (created in
-- 0001). Idempotent, safe to re-run. No drop/rename; Cleo tables untouched.
--
-- Live-schema check before writing this (service role, 2026-07-11):
--   (user_id, week_starting) on checkin_analysis has only a NON-unique index
--   (idx_checkin_analysis_user_week) — not usable as an upsert conflict target.
--   Existing rows: 0 duplicate (user_id, week_starting) pairs, so the unique
--   index below will not collide.
--
-- Why: the analysis writer upserts ONE analysis row per client per week
--   (onConflict user_id,week_starting), so re-running Saturday's cron — or the
--   manual "Run analysis now" button — refreshes the week's row instead of
--   piling up duplicates. Mirrors 0010's checkin_responses unique index.

begin;

create unique index if not exists checkin_analysis_user_week_uidx
  on public.checkin_analysis (user_id, week_starting);

commit;
