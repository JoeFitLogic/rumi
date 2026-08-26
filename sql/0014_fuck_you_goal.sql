-- RUMI migration 0014
-- Part 13 of the revised Resonance Identity Foundation Form
-- adds one question: "What is your big fuck-you goal?"
--
-- Run order: standalone. Requires only that
-- public.onboarding_responses exists. Independent of 0013,
-- though in practice it lands after it.
--
-- WHAT: one new column. The revised form is otherwise a
-- rewording of the existing one -- every other changed question
-- reuses the column it already had. Part 9 looks like a new
-- question but is not: "List all client results or moments"
-- and "Tell the story of your best transformation" were
-- already stored separately as client_wins and
-- best_transformation_story (two halves of one question), so
-- splitting them into two numbered questions needs no schema
-- change at all.
--
-- CLEO SAFETY:
--   * Purely ADDITIVE. No drop, no rename, no type change, no
--     policy change, no grant change.
--   * text, NULLABLE, NO default -- so every existing Cleo
--     insert keeps working untouched and Cleo "select *" reads
--     simply gain one extra null key.
--   * No grants needed. sql/0003 granted SELECT on the whole
--     table to `authenticated` and 0007/0008 settled UPDATE.
--     Both are TABLE-level, so the new column inherits them.
--     Deliberately NOT re-granting -- see the shared-DB note in
--     docs/production-db-guidelines.md about widening grants on
--     a Cleo table.
--   * Name checked against the live schema before writing:
--     onboarding_responses.fuck_you_goal does not exist today.
--
-- Idempotent: `add column if not exists`, safe to re-run.
--
-- DEPLOY ORDER: run this BEFORE deploying the code that writes
-- the column. The public /onboarding form's insert names its
-- columns explicitly, so a submission would fail on 42703
-- until this has run.

begin;

alter table public.onboarding_responses
  -- PART 13 - Your Goals
  add column if not exists fuck_you_goal text;

commit;
