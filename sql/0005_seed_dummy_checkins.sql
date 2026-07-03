-- RUMI seed 0005 — dummy check-in data for two test clients
-- Run in the Supabase SQL editor on project eygxousnaylqzxzwqwwe.
-- Safe to re-run (idempotent). Creates two clearly-marked @rumi.test clients,
-- 6 weeks of checkin_responses each, and a latest checkin_analysis row each so
-- the dashboard Recommendations section renders. Client A is active (checked in
-- this week); Client B's last check-in is ~3 weeks ago, to exercise the admin
-- "needs a check-in" (14+ day) flag. See the cleanup block at the foot to undo.
--
-- Both seed users get a real password ('SeedClient!2026') so you can also sign
-- in as seed-one@rumi.test / seed-two@rumi.test to see the client-side view.
-- Requires the pgcrypto extension (enabled by default on Supabase) for
-- crypt()/gen_salt().

begin;

-- Fixed UUIDs so re-runs don't pile up duplicates.
-- A = 11111111-… (active), B = 22222222-… (stale/struggling).

-- ── auth users ──────────────────────────────────────────────────────────
-- The handle_new_user trigger (0002) fires on insert and creates the matching
-- profiles row (role 'client', account_status 'active', name from metadata).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  is_super_admin
)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-4111-8111-111111111111',
   'authenticated', 'authenticated', 'seed-one@rumi.test',
   crypt('SeedClient!2026', gen_salt('bf')),
   now(), now() - interval '90 days', now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Priya Nair"}',
   '', '', '', '', false),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-4222-8222-222222222222',
   'authenticated', 'authenticated', 'seed-two@rumi.test',
   crypt('SeedClient!2026', gen_salt('bf')),
   now(), now() - interval '90 days', now(),
   '{"provider":"email","providers":["email"]}',
   '{"name":"Marcus Bell"}',
   '', '', '', '', false)
on conflict (id) do nothing;

-- Backstop in case the trigger wasn't installed when a user was created.
insert into public.profiles (id, email, name, role, account_status, onboarding_complete)
values
  ('11111111-1111-4111-8111-111111111111', 'seed-one@rumi.test', 'Priya Nair', 'client', 'active', true),
  ('22222222-2222-4222-8222-222222222222', 'seed-two@rumi.test', 'Marcus Bell', 'client', 'active', true)
on conflict (id) do nothing;

-- ── check-in responses ──────────────────────────────────────────────────
delete from public.checkin_responses
where user_id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);

-- Client A (Priya) — active, gentle upward trend, weeks 0..5 ago.
with base as (select date_trunc('week', now())::date as monday)
insert into public.checkin_responses (
  user_id, week_starting, calls_booked, calls_offered, calls_taken, sales_made,
  cash_collected, cash_contracted, month_revenue, followers_gained,
  content_volume, dm_confidence, content_satisfaction, mindset_score,
  biggest_win, week_priority, created_at
)
select
  '11111111-1111-4111-8111-111111111111',
  (base.monday - (v.wago * 7))::date,
  v.calls_booked, v.calls_offered, v.calls_taken, v.sales_made,
  v.cash_collected, v.cash_contracted, v.month_revenue, v.followers_gained,
  v.content_volume, v.dm_confidence, v.content_satisfaction, v.mindset_score,
  v.biggest_win, v.week_priority,
  ((base.monday - (v.wago * 7)) + 5)::timestamptz
from base, (values
  (0, 12, 20, 15, 8, 3200, 4200, 9800, 280, 9, 9, 8, 8, 'Closed two high-ticket clients from Reels', 'Double down on story selling'),
  (1, 10, 19, 13, 6, 2600, 3600, 8900, 220, 8, 8, 8, 8, 'First VSL booked five calls', 'Tighten the offer stack'),
  (2, 11, 18, 14, 6, 2900, 3400, 8400, 240, 8, 8, 7, 7, 'Best week for saves so far', 'Batch a week of content'),
  (3,  8, 16, 11, 4, 1900, 2800, 7600, 160, 6, 7, 7, 7, 'Landed a podcast guest slot', 'Fix the DM opener'),
  (4,  9, 17, 12, 5, 2200, 3000, 7900, 190, 7, 7, 7, 7, 'Reel hit 40k views', 'Test a new hook style'),
  (5,  7, 15, 10, 3, 1500, 2400, 7100, 130, 5, 6, 6, 6, 'Rebuilt the lead magnet', 'Post consistently 5x')
) as v(wago, calls_booked, calls_offered, calls_taken, sales_made,
       cash_collected, cash_contracted, month_revenue, followers_gained,
       content_volume, dm_confidence, content_satisfaction, mindset_score,
       biggest_win, week_priority);

-- Client B (Marcus) — struggling, declining, last check-in ~3 weeks ago
-- (weeks 3..8 ago → latest created_at ≈ 16 days ago → flagged).
with base as (select date_trunc('week', now())::date as monday)
insert into public.checkin_responses (
  user_id, week_starting, calls_booked, calls_offered, calls_taken, sales_made,
  cash_collected, cash_contracted, month_revenue, followers_gained,
  content_volume, dm_confidence, content_satisfaction, mindset_score,
  biggest_win, week_priority, created_at
)
select
  '22222222-2222-4222-8222-222222222222',
  (base.monday - (v.wago * 7))::date,
  v.calls_booked, v.calls_offered, v.calls_taken, v.sales_made,
  v.cash_collected, v.cash_contracted, v.month_revenue, v.followers_gained,
  v.content_volume, v.dm_confidence, v.content_satisfaction, v.mindset_score,
  v.biggest_win, v.week_priority,
  ((base.monday - (v.wago * 7)) + 5)::timestamptz
from base, (values
  (3,  3,  9,  4, 1,  600, 1500, 4200,  40, 3, 4, 4, 4, 'Shot three Reels but only posted one', 'Actually post daily'),
  (4,  4, 10,  5, 1,  800, 1800, 4600,  55, 4, 5, 5, 5, 'Had a good sales call', 'Follow up faster'),
  (5,  5, 11,  6, 2, 1100, 2000, 5200,  70, 5, 5, 5, 6, 'Two referrals came in', 'Nail the follow-up sequence'),
  (6,  6, 12,  7, 2, 1300, 2200, 5600,  90, 5, 6, 6, 6, 'Consistent posting for a week', 'Improve hook writing'),
  (7,  5, 11,  6, 1,  900, 1900, 5100,  60, 4, 5, 5, 5, 'Cleared the content backlog', 'Book more calls'),
  (8,  6, 13,  8, 3, 1600, 2600, 6000, 110, 6, 6, 6, 6, 'Strong launch week', 'Keep the momentum')
) as v(wago, calls_booked, calls_offered, calls_taken, sales_made,
       cash_collected, cash_contracted, month_revenue, followers_gained,
       content_volume, dm_confidence, content_satisfaction, mindset_score,
       biggest_win, week_priority);

-- ── latest analysis (so the Recommendations section has content) ─────────
delete from public.checkin_analysis
where user_id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222'
);

insert into public.checkin_analysis (
  user_id, week_starting, red_flags, plateaus, themes, recommendations, created_at
)
select
  '11111111-1111-4111-8111-111111111111',
  date_trunc('week', now())::date,
  null,
  'Followers gained has been steady around 240/week for three weeks — the top of funnel is stable but not accelerating.',
  'Story-led selling and high-ticket closes are clearly working. Confidence and content satisfaction are trending up together.',
  E'1. Keep leaning into story-selling Reels — two closes came directly from them this week.\n2. Your DM confidence jumped to 9; use it to re-open the 4 no-shows from last month.\n3. Content is consistent — now add one long-form VSL touchpoint per week to lift cash collected further.',
  now();

insert into public.checkin_analysis (
  user_id, week_starting, red_flags, plateaus, themes, recommendations, created_at
)
select
  '22222222-2222-4222-8222-222222222222',
  (date_trunc('week', now())::date - 21),
  E'Calls booked and cash collected have fallen for three straight weeks, and mindset score dropped to 4. No check-in submitted in over two weeks — re-engagement needed.',
  'Content volume stuck at 3-5 posts/week with low satisfaction — posting is happening but not landing.',
  'The drop lines up with inconsistent posting and slower follow-ups after calls.',
  E'1. Rebook the calls that did not close — speed of follow-up is the biggest lever right now.\n2. Drop to 3 deliberate posts a week instead of 5 rushed ones; protect quality.\n3. Book a mindset reset call — the score dip is the leading indicator here.',
  (now() - interval '16 days');

commit;

-- ── cleanup (run to remove all seed data) ────────────────────────────────
-- delete from public.checkin_analysis  where user_id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
-- delete from public.checkin_responses where user_id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
-- delete from public.profiles          where id      in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
-- delete from auth.users               where id      in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
