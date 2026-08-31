-- 0016_reassign_shared_competitor_rows.sql
--
-- Purpose: give every client a clean competitor board, without
-- destroying anything.
--
-- 0015 moved the pre-existing competitor rows onto a sentinel owner
-- so that NULL could mean "unclaimed". Those sentinel rows are read
-- by EVERY client, which is why the same 60 videos and the same 4
-- creators show up on every login. This file moves that whole
-- shared set onto Joe's own profile instead.
--
-- The effect is the same as deleting it, from a client's point of
-- view: nothing is shared any more, so a client sees only what they
-- have claimed themselves. The difference is that the rows survive,
-- SMAI keeps its analysed history, and the whole thing is one
-- update away from being undone.
--
-- NEW OWNER
--   e19354ba-0988-4721-8fe2-d4ae983d8b9f
--   Joe McNee <joe@fitlogicsystems.co.uk>, role admin, active.
--   Verified as the only profile row with that email.
--
-- SCOPE. Every statement filters on the sentinel, so nothing that
-- belongs to a real client is reachable from this file.
--
--   client_id = '00000000-0000-0000-0000-000000000000'  -> Joe
--   client_id = <a client's uuid>                       UNTOUCHED
--   client_id IS NULL (scraped, unclaimed)              UNTOUCHED
--
-- Counts at the time of writing (2026-08-31):
--
--   videos    60 shared,  0 client-owned,  0 null
--   creators   4 shared,  1 client-owned,  0 null
--   configs    1 shared,  0 client-owned,  0 null
--
-- The one client-owned row is the creator @alexbenshaw, owned by
-- info+admin@contentcoachhq.com. It must survive untouched. The
-- verification at the foot checks exactly that.
--
-- The config's two instruction prompts need no separate backup:
-- the row itself is not deleted, so "Fitness Coaches" keeps its
-- analysisInstruction and newConceptsInstruction intact, just under
-- a different owner.
--
-- WHO ELSE READS THESE TABLES
--   * Cleo does NOT. docs/production-db-guidelines.md calls these
--     "Cleo research/competitor data", which is wrong: Cleo's own
--     code (reference/alex-cleo) never queries videos, creators or
--     configs. It uses competitor_media / competitor_accounts.
--   * SMAI DOES, and is unaffected: getVideos() in
--     reference/smai/app/src/lib/db.ts selects the whole table with
--     no client_id filter, so SMAI's board looks identical after
--     this runs. That is the main reason to reassign rather than
--     delete.
--
-- REVERSIBLE. To undo, swap the two uuids in each update below.
--
-- Idempotent: a second run matches zero rows.
--
-- Depends on: 0015 (puts the shared set on the sentinel).

-- ── STEP 1: preview. Run this alone first. ──────────────────────
-- Expect 60 / 4 / 1 in the first column, 0 / 1 / 0 in the second.

select 'videos' as tbl,
       count(*) filter (
         where client_id = '00000000-0000-0000-0000-000000000000'
       ) as shared_to_move,
       count(*) filter (
         where client_id is not null
           and client_id <> '00000000-0000-0000-0000-000000000000'
       ) as client_owned_keep
  from public.videos
union all
select 'creators',
       count(*) filter (
         where client_id = '00000000-0000-0000-0000-000000000000'
       ),
       count(*) filter (
         where client_id is not null
           and client_id <> '00000000-0000-0000-0000-000000000000'
       )
  from public.creators
union all
select 'configs',
       count(*) filter (
         where client_id = '00000000-0000-0000-0000-000000000000'
       ),
       count(*) filter (
         where client_id is not null
           and client_id <> '00000000-0000-0000-0000-000000000000'
       )
  from public.configs;

-- ── STEP 2: the reassign. ───────────────────────────────────────

begin;

-- 60 videos.
update public.videos
   set client_id = 'e19354ba-0988-4721-8fe2-d4ae983d8b9f'
 where client_id = '00000000-0000-0000-0000-000000000000';

-- 4 creators: @joe_fitlogic_systems, @therealbrianmark,
-- @markstrathern_, @Niamhcrichardson_. @alexbenshaw is client-owned
-- and is not matched by this filter.
update public.creators
   set client_id = 'e19354ba-0988-4721-8fe2-d4ae983d8b9f'
 where client_id = '00000000-0000-0000-0000-000000000000';

-- 1 config: "Fitness Coaches", prompts intact.
update public.configs
   set client_id = 'e19354ba-0988-4721-8fe2-d4ae983d8b9f'
 where client_id = '00000000-0000-0000-0000-000000000000';

commit;

-- ── STEP 3: verify. ─────────────────────────────────────────────
-- Expect 0 shared rows across all three tables.

select 'videos' as tbl, count(*) as shared_left
  from public.videos
 where client_id = '00000000-0000-0000-0000-000000000000'
union all
select 'creators', count(*)
  from public.creators
 where client_id = '00000000-0000-0000-0000-000000000000'
union all
select 'configs', count(*)
  from public.configs
 where client_id = '00000000-0000-0000-0000-000000000000';

-- Expect 60 / 4 / 1 now owned by Joe.
select 'videos' as tbl, count(*) as joes
  from public.videos
 where client_id = 'e19354ba-0988-4721-8fe2-d4ae983d8b9f'
union all
select 'creators', count(*)
  from public.creators
 where client_id = 'e19354ba-0988-4721-8fe2-d4ae983d8b9f'
union all
select 'configs', count(*)
  from public.configs
 where client_id = 'e19354ba-0988-4721-8fe2-d4ae983d8b9f';

-- Must still return exactly 1 row: @alexbenshaw, owner unchanged.
select username, client_id
  from public.creators
 where client_id is not null
   and client_id <> '00000000-0000-0000-0000-000000000000'
   and client_id <> 'e19354ba-0988-4721-8fe2-d4ae983d8b9f';
