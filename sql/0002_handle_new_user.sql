-- RUMI migration 0002 — standardize the handle_new_user trigger
-- Run in the Supabase SQL editor on project eygxousnaylqzxzwqwwe.
-- Run order: 0001 → 0002 → 0003 (this writes account_status, added by 0001).
--
-- ⚠️ CORRECTION TO THE BRIEF: this project ALREADY has a trigger that inserts a
-- public.profiles row on auth.users insert. Verified live 2026-07-03: creating
-- an auth user auto-produced profiles(role='client', email set,
-- onboarding_complete=false) — but name was NOT captured from user metadata.
--
-- This migration REPLACES that trigger with a hardened version that also
-- captures name, and keeps ON CONFLICT DO NOTHING so an explicit upsert from
-- createClientAccount()/api-intake in the same request is never clobbered.
-- It assumes the existing objects use the conventional names
-- (function handle_new_user, trigger on_auth_user_created) — CONFIRM with the
-- trigger query in sql/introspect_rls.sql. If the live names differ, drop the
-- old trigger by its real name too, or you'll have two triggers firing (both
-- ON CONFLICT DO NOTHING, so still safe, just redundant).
--
-- Cleo is untouched: existing profiles rows are not modified; this only fires
-- on NEW auth users going forward.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, name, role, account_status, onboarding_complete)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    'client',
    'active',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
