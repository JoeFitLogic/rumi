-- 0010_checkin_upsert_and_note.sql
-- Session 5 — Weekly Check-In.
--
-- Two additive changes to the Rumi-owned `checkin_responses` table (created in
-- 0001). Idempotent and safe to re-run. No drop/rename; Cleo tables untouched.
--
-- Live-schema check before writing this (service role, 2026-07-11):
--   • checkin_responses has all 0001 columns; `calls_attended_note` does NOT
--     exist yet.
--   • (user_id, week_starting) has only a NON-unique index
--     (idx_checkin_responses_user_week) — not usable as an upsert conflict
--     target. The seed data has exactly one row per (user, week), so adding a
--     unique index below will not collide with existing rows.
--
-- Why:
--   1. calls_attended_note — the check-in question is "How many calls did you
--      attend last week? If none, why?". The number goes to calls_attended
--      (int); this column holds the free-text "why". Chosen over folding the
--      "why" into an unrelated text field so it stays queryable and paired.
--   2. Unique index on (user_id, week_starting) — the form upserts one row per
--      client per week (submitCheckin uses onConflict user_id,week_starting), so
--      resubmitting a week edits the existing row instead of duplicating it.

begin;

-- 1. Free-text "why" for calls_attended.
alter table public.checkin_responses
  add column if not exists calls_attended_note text;

-- 2. One check-in per client per week → upsert conflict target.
create unique index if not exists checkin_responses_user_week_uidx
  on public.checkin_responses (user_id, week_starting);

commit;
