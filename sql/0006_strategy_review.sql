-- RUMI migration 0006 — strategy review + release columns
-- Run in the Supabase SQL editor on project eygxousnaylqzxzwqwwe.
-- (Numbered 0006 because 0004_set_admins and 0005_seed already exist — the
--  brief said "0004_strategy_review"; renamed to avoid clobbering them.)
--
-- Model:
--   • released_at IS NOT NULL              → released to the client
--   • status = 'complete' AND released_at IS NULL → in review (admin only)
--   • review_deadline drives the hourly auto-release cron.

alter table public.strategies
  add column if not exists released_at     timestamptz,
  add column if not exists review_deadline timestamptz;

-- Fast lookup for the auto-release cron: complete + unreleased + past deadline.
create index if not exists idx_strategies_review_release
  on public.strategies (review_deadline)
  where status = 'complete' and released_at is null;
