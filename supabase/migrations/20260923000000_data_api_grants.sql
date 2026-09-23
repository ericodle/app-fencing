-- ─────────────────────────────────────────────────────────────────────────────
-- Grant the API roles what the local stack grants them by default.
--
-- A Supabase project created with "automatically expose new tables" off gives
-- anon and authenticated nothing on a table the migrations create — no SELECT,
-- no INSERT — and no EXECUTE on a function. Every PostgREST call then fails
-- with 42501 before any policy is consulted. The local stack, like older cloud
-- projects, grants all of it, so the tests pass against a schema the cloud
-- refuses.
--
-- The grants change nothing about who can see what: RLS is the security
-- boundary (every table here has it enabled), and a table without a policy for
-- a role still returns no rows to it. This only makes the cloud project
-- behave like the one the tests run against. The default privileges carry the
-- same grants to every table a later migration creates.
-- ─────────────────────────────────────────────────────────────────────────────

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
