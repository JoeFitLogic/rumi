-- RUMI migration 0013
-- Resonance Identity Foundation Form columns
--
-- Run order: standalone. Depends on nothing from 0001-0012; it
-- only requires public.onboarding_responses to exist (it is
-- Cleo's, and predates Rumi).
--
-- WHAT: adds the 34 columns the new native /onboarding form
-- needs that the old GHL form never had. 24 of the form's 50
-- content questions already land on existing columns and are
-- untouched here.
--
-- CLEO SAFETY:
--   * Purely ADDITIVE. No drop, no rename, no type change, no
--     policy change. Every existing Cleo column is left as is.
--   * Every new column is text, NULLABLE, with NO default, so
--     Cleo inserts (which name their own columns) keep working
--     untouched, and Cleo "select *" reads simply gain extra
--     null keys.
--   * No grants needed. sql/0003 granted SELECT on the whole
--     table to `authenticated`, and 0007/0008 settled UPDATE.
--     Both are TABLE-level, so new columns inherit the existing
--     admin/VA select policy automatically. Deliberately NOT
--     re-granting anything here -- see the shared-DB note in
--     docs/production-db-guidelines.md about widening grants on
--     Cleo tables.
--   * Verified against the live production schema before
--     writing: all 34 names were diffed against the 38 columns
--     onboarding_responses has today. Zero collisions.
--
-- Idempotent: every clause is `add column if not exists`, so
-- the whole file is safe to re-run.
--
-- DEPLOY ORDER: run this BEFORE deploying the code that writes
-- these columns. Reads are safe either way (every consumer uses
-- "select *"), but the admin onboarding editor's save path
-- names columns explicitly.
--
-- NOTE: one ALTER TABLE with 34 ADD clauses rather than 34
-- separate statements, purely so no line is long enough to wrap
-- when pasted. Identical effect, still idempotent.

begin;

alter table public.onboarding_responses
  -- PART 2 - Your Content
  add column if not exists instagram_url text,
  add column if not exists youtube_url text,
  add column if not exists top_reels_urls text,
  -- PART 3 - Your Business
  add column if not exists current_monthly_revenue text,
  -- PART 4 - Where Your Brand Is Now
  add column if not exists brand_snapshot text,
  -- PART 5 - Your Mission and Drive
  add column if not exists deeper_driver text,
  add column if not exists discomforts_running_from text,
  add column if not exists ideal_life text,
  -- PART 6 - Your Story
  add column if not exists key_life_moments text,
  add column if not exists origin_story text,
  add column if not exists lowest_point text,
  add column if not exists what_shifted text,
  -- PART 7 - Your Conviction and Positioning
  add column if not exists industry_hates text,
  add column if not exists contrarian_beliefs text,
  add column if not exists unique_approach text,
  add column if not exists known_for text,
  add column if not exists core_values text,
  -- PART 8 - Your Ideal Client
  add column if not exists client_2am_thoughts text,
  add column if not exists not_your_client text,
  -- PART 9 - Client Results
  add column if not exists client_wins text,
  add column if not exists best_transformation_story text,
  add column if not exists testimonials text,
  -- PART 10 - Your Voice
  add column if not exists creators_that_cringe text,
  add column if not exists how_you_talk text,
  -- swearing_level is a select in the form (None / Light /
  -- Moderate / Heavy) but is kept as plain text on purpose: no
  -- enum, no check constraint, nothing that could ever reject a
  -- write from Cleo's side of the shared table.
  add column if not exists swearing_level text,
  add column if not exists speech_examples text,
  add column if not exists catchphrases text,
  add column if not exists words_never_say text,
  -- PART 11 - Your World
  add column if not exists characters_in_world text,
  add column if not exists interests_hobbies text,
  add column if not exists old_self_vs_new_self text,
  -- PART 12 - Where You're Stuck
  add column if not exists fears_about_visibility text,
  add column if not exists mental_loop text,
  -- Bookkeeping (not a form question). 'native' = the Rumi
  -- /onboarding form, 'ghl' = the /api/intake webhook. Left
  -- NULL on every existing row: backfilling would mean an
  -- UPDATE across Cleo's rows for no operational gain. NULL
  -- simply reads as "pre-native".
  add column if not exists submission_source text;

commit;
