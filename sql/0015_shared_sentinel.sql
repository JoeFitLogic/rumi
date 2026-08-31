-- 0015_shared_sentinel.sql
--
-- Purpose: make `client_id IS NULL` mean exactly one thing on the
-- three competitor tables.
--
-- Before this file NULL meant two different things at once:
--   * the original Cleo rows, shared with every client on purpose
--   * rows a scrape just wrote that no client has claimed yet
--
-- Rumi's read filter was "client_id = me OR client_id IS NULL", so
-- the second kind was readable by EVERY client. A claim only runs
-- from the browser after a run completes, so a closed tab left one
-- client's scrape visible to all of them.
--
-- After this file:
--   * shared row       -> client_id = the all-zero sentinel
--   * a client's row   -> client_id = that client's uuid
--   * NULL             -> unclaimed, readable by NOBODY
--
-- src/lib/research/competitor.ts changes to
-- "client_id = me OR client_id = sentinel" in the same commit.
--
-- Safety (see docs/production-db-guidelines.md):
--   * Sets only the column Rumi itself added in 0012. Cleo does
--     not select client_id, so Cleo is unaffected.
--   * No DROP, no ALTER DROP, no rename, no RLS change.
--   * 0012 deliberately left this column without an FK, so a
--     sentinel that is not a real profile id is legal.
--   * Idempotent. A second run matches zero rows.
--
-- RUN THIS WHEN NO SCRAPE IS IN FLIGHT. It folds every currently
-- unclaimed row into the shared set. That is what we want for the
-- 60 videos that exist today (36 original Cleo rows plus 24 from
-- an Aug 2026 run that was never claimed), but it would wrongly
-- donate a live run's output to everyone.
--
-- ORDER vs the code deploy: either way round is SAFE, and either
-- way round the 60 shared rows are briefly invisible, because the
-- old filter looks for NULL and the new one looks for the
-- sentinel, so whichever half lands first matches nothing. No
-- leak in the gap either way. Just keep the gap short.
--
-- Depends on: 0012 (adds the client_id column).

begin;

update public.videos
   set client_id = '00000000-0000-0000-0000-000000000000'
 where client_id is null;

update public.creators
   set client_id = '00000000-0000-0000-0000-000000000000'
 where client_id is null;

update public.configs
   set client_id = '00000000-0000-0000-0000-000000000000'
 where client_id is null;

commit;

-- Verification. Expect 0 from the first, 60 / 4 / 1 from the rest
-- (creators also has 1 client-owned row, videos and configs none).
--
-- select count(*) from public.videos where client_id is null;
--
-- select count(*) from public.videos
--  where client_id = '00000000-0000-0000-0000-000000000000';
--
-- select count(*) from public.creators
--  where client_id = '00000000-0000-0000-0000-000000000000';
--
-- select count(*) from public.configs
--  where client_id = '00000000-0000-0000-0000-000000000000';

-- Rollback (puts the shared set back to NULL, which re-opens the
-- hole described above; only for an emergency revert of the code).
--
-- update public.videos set client_id = null
--  where client_id = '00000000-0000-0000-0000-000000000000';
