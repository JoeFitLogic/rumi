-- 0012_competitor_client_scope.sql
--
-- Purpose: make competitor research PER-CLIENT in Rumi.
--   Adds a nullable `client_id` to the three Cleo-shared competitor tables
--   (`videos`, `creators`, `configs`) so each Rumi client owns the rows their
--   own scrapes produce, while every existing (Cleo) row keeps `client_id = NULL`
--   and stays visible as shared/legacy data.
--
-- Safety (see docs/production-db-guidelines.md):
--   * ADDITIVE ONLY. No DROP / ALTER DROP / rename of any Cleo object.
--   * Existing rows are untouched — `client_id` defaults to NULL, so Cleo's
--     frontend reads and the SMAI pipeline's writes keep working identically.
--   * RLS is NOT changed. These tables' policies (and configs' disabled RLS)
--     stay exactly as they are; Rumi reads/writes them SERVER-SIDE via the
--     service role with an explicit owner filter, so no new policy is needed.
--   * No FK to profiles(id): kept deliberately loose so a future Cleo insert
--     can never be rejected by this migration. Rumi only ever writes a
--     client_id it has already validated through getActiveClient().
--   * Idempotent — safe to re-run (add column / index IF NOT EXISTS).
--
-- Order: independent of other migrations. Run any time after 0001.

begin;

-- videos: owner of a scraped competitor reel
alter table public.videos   add column if not exists client_id uuid;
-- creators: owner of a tracked competitor account
alter table public.creators add column if not exists client_id uuid;
-- configs: owner of a scrape configuration
alter table public.configs  add column if not exists client_id uuid;

-- Partial indexes — Rumi always filters "this client's rows OR legacy NULL",
-- so index the non-null owner lookups. NULL/global rows are found via IS NULL.
create index if not exists videos_client_id_idx   on public.videos   (client_id) where client_id is not null;
create index if not exists creators_client_id_idx on public.creators (client_id) where client_id is not null;
create index if not exists configs_client_id_idx  on public.configs  (client_id) where client_id is not null;

commit;

-- Rollback (only if ever needed; destructive to the new column's data):
--   alter table public.videos   drop column if exists client_id;
--   alter table public.creators drop column if exists client_id;
--   alter table public.configs  drop column if exists client_id;
