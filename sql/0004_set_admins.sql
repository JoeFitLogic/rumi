-- RUMI migration 0004 — grant admin role
-- Run in the Supabase SQL editor on project eygxousnaylqzxzwqwwe.
-- Run order: after 0001 (needs account_status). Idempotent — safe to re-run,
-- and this is the same snippet you'll reuse for Alex's email later.
--
-- Live check 2026-07-03:
--   • joe@fitlogicsystems.co.uk      → already exists, already role='admin'.
--   • info@contentcoachhq.com        → already exists, already role='admin'.
--   • businessconciergeagency@gmail.com → DOES NOT EXIST yet (no auth user,
--       no profile). The UPDATE below will touch 0 rows for it until the
--       account is created. Create it FIRST via createClientAccount (it makes
--       the auth user + client profile and emails a set-password link), THEN
--       run this to elevate. Turnkey:
--         node scripts/bootstrap-admin.mjs "businessconciergeagency@gmail.com" "Name"
--       (or invoke the createClientAccount server action from an admin session).

update public.profiles
set role = 'admin',
    account_status = 'active'
where email in (
  'joe@fitlogicsystems.co.uk',
  'info@contentcoachhq.com',
  'businessconciergeagency@gmail.com'
  -- ,'<alex@email>'   -- add Alex here when known
);

-- Verify:
select email, role, account_status, name
from public.profiles
where email in (
  'joe@fitlogicsystems.co.uk',
  'info@contentcoachhq.com',
  'businessconciergeagency@gmail.com'
)
order by email;
