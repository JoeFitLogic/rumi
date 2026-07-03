-- RUMI RLS introspection — NOT a migration. Run this and paste the output back.
-- Confirms the live RLS state that anon-key probes can't see (authenticated-role
-- policies). Run on project eygxousnaylqzxzwqwwe.

-- 1. Which tables have RLS enabled / forced?
select
  c.relname                         as table_name,
  c.relrowsecurity                  as rls_enabled,
  c.relforcerowsecurity             as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('strategies','strategy_sections','onboarding_responses',
                    'content_ideas','scripts','profiles','videos','creators',
                    'configs','checkin_responses','checkin_analysis')
order by c.relname;

-- 2. Every policy on those tables (name, command, roles, using/check exprs).
select
  tablename,
  policyname,
  cmd,
  roles,
  permissive,
  qual        as using_expr,
  with_check  as check_expr
from pg_policies
where schemaname = 'public'
  and tablename in ('strategies','strategy_sections','onboarding_responses',
                    'content_ideas','scripts','profiles','videos','creators',
                    'configs','checkin_responses','checkin_analysis')
order by tablename, cmd, policyname;

-- 2b. Existing trigger(s) on auth.users + the function they call (confirms the
--     name to standardize on in 0002 — live probing showed a trigger already
--     exists that inserts profiles(role='client', email, onboarding_complete)).
select t.tgname as trigger_name, p.proname as function_name, n.nspname as function_schema
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace cn on cn.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where cn.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal
order by t.tgname;

-- 3. Grants to anon / authenticated (RLS passes but a missing GRANT still 42501s).
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon','authenticated')
  and table_name in ('strategies','strategy_sections','onboarding_responses',
                     'content_ideas','scripts','profiles','videos','creators','configs')
group by table_name, grantee
order by table_name, grantee;
