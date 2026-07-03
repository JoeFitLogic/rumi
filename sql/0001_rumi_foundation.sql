-- RUMI foundation migration
-- Run in the Supabase SQL editor on project eygxousnaylqzxzwqwwe.
-- Existing Cleo tables (profiles, onboarding_responses, strategies,
-- strategy_sections, content_ideas, videos, creators, configs) are
-- untouched — Cleo stays live throughout.

-- ── profiles: columns Rumi relies on (no-ops if already present) ──
alter table public.profiles
  add column if not exists linked_user_id uuid references auth.users(id),
  add column if not exists account_status text default 'active';

-- ── checkin_responses ─────────────────────────────────────────────
create table if not exists public.checkin_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  week_starting date not null,
  -- Business Health
  calls_attended int,
  calls_offered int,
  calls_booked int,
  calls_taken int,
  sales_made int,
  cash_collected numeric,
  cash_contracted numeric,
  month_revenue numeric,
  followers_gained int,
  content_volume int,
  story_sequences int,
  dm_confidence int check (dm_confidence between 1 and 10),
  -- Content
  content_satisfaction int check (content_satisfaction between 1 and 10),
  content_win text,
  audience_topic text,
  client_transcripts text,
  contrarian_observation text,
  client_lesson text,
  -- Mindset
  mindset_score int check (mindset_score between 1 and 10),
  personal_reflection text,
  biggest_win text,
  growth_blocker text,
  stuck_areas text[],
  week_priority text,
  -- Feedback
  feature_requests text,
  support_needed text,
  mentor_feedback text,
  created_at timestamptz default now()
);

-- ── checkin_analysis (Saturday cron output) ───────────────────────
create table if not exists public.checkin_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  week_starting date not null,
  red_flags text,
  plateaus text,
  themes text,
  recommendations text,
  created_at timestamptz default now()
);

-- ── RLS ────────────────────────────────────────────────────────────
alter table public.checkin_responses enable row level security;
alter table public.checkin_analysis enable row level security;

-- Clients read/write their own rows; admins read/write everything;
-- VAs act on behalf of their linked client.
create policy "checkin_responses_select" on public.checkin_responses
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or (p.role = 'va' and p.linked_user_id = checkin_responses.user_id))
    )
  );

create policy "checkin_responses_insert" on public.checkin_responses
  for insert with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or (p.role = 'va' and p.linked_user_id = checkin_responses.user_id))
    )
  );

create policy "checkin_analysis_select" on public.checkin_analysis
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.role = 'admin' or (p.role = 'va' and p.linked_user_id = checkin_analysis.user_id))
    )
  );

-- Analysis rows are written by the Saturday cron using the service
-- role key, which bypasses RLS — no insert policy needed for users.

create index if not exists idx_checkin_responses_user_week
  on public.checkin_responses (user_id, week_starting desc);

create index if not exists idx_checkin_analysis_user_week
  on public.checkin_analysis (user_id, week_starting desc);
