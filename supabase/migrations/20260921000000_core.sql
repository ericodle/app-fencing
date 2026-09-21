-- ─────────────────────────────────────────────────────────────────────────────
-- Core: extensions, the RLS guard rails, profiles, and the audit trail.
--
-- Everything else in this schema hangs off `profiles`. Read this file first.
--
-- Two conventions hold across every migration here:
--   1. RLS is ON for every table in `public`, enforced by the `rls_auto_enable`
--      event trigger below. A table created without a policy is therefore
--      readable by nobody, which is the safe direction to fail in.
--   2. Any function marked SECURITY DEFINER pins `search_path` to 'public'.
--      Without it a caller can prepend a schema of their own and take over the
--      function's identity.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "citext"   with schema "extensions";


-- ── RLS guard rail ───────────────────────────────────────────────────────────
-- An event trigger that turns RLS on for every table created in `public`.
-- Forgetting `alter table ... enable row level security` on one table is the
-- single mistake in this schema that silently exposes everything in it, so it
-- is not left to a reviewer to catch.

create or replace function public.rls_auto_enable() returns event_trigger
  language plpgsql
  as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', obj.object_identity);
  end loop;
end;
$$;

drop event trigger if exists rls_auto_enable;
create event trigger rls_auto_enable
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();


-- ── profiles ─────────────────────────────────────────────────────────────────
-- One row per person, keyed to auth.users. Holds three quite different kinds of
-- data, which is why the column list is long:
--
--   • account      — role, status, family link, terms acceptance
--   • contact      — name, emergency contact, how to reach them
--   • the athlete  — handedness, reach, weapons, ratings, where they travel from
--
-- The athlete block is deliberately the *stable* measurements only. Anything
-- that improves with training — sprint time, 5k, lunge length, jump — is a row
-- in `fitness_tests` with a date on it, not a column here. A single
-- `sprint_100m_s` column answers "how fast is she?" and destroys the answer to
-- "is she getting faster?", which is the question a club actually asks.

create table if not exists public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- account
  role                     text not null default 'fencer',
  status                   text not null default 'pending',
  parent_account           uuid references public.profiles(id) on delete set null,
  application_submitted_at timestamptz,
  agreed_to_terms_at       timestamptz,
  agreed_to_terms_version  integer,

  -- identity and contact
  name                     text,
  nickname                 text,
  email                    text,
  date_of_birth            date,
  nationality              text,
  id_number                text,
  gender                   text,
  contact_method           text,
  contact_id               text,
  emergency_contact_name   text,
  emergency_contact_phone  text,
  medical_notes            text,
  avatar_url               text,

  -- the athlete: stable attributes
  handedness               text,
  height_cm                numeric,
  weight_kg                numeric,
  -- Arm span, fingertip to fingertip. Recorded separately from height because
  -- the ratio (the "ape index") is the number that matters in a distance
  -- weapon: reach beats height in épée, and the two are not interchangeable.
  arm_span_cm              numeric,
  -- Which hand holds the weapon. Roughly one fencer in seven is left-handed
  -- against one person in ten in the population, and a left-hander meets
  -- right-handers constantly while right-handers rarely drill against lefties
  -- — so the app reports the split on every roster and bout sheet.
  weapons                  text[] not null default '{}',
  primary_weapon           text,
  grip                     text,
  started_fencing_on       date,
  -- National letter classification, per weapon, with the year it was earned.
  -- Letters expire after four seasons in the USFA system, so the year is not
  -- decoration — `src/lib/ratings.ts` uses it to show a lapsed letter as such.
  rating_epee              text,
  rating_epee_year         integer,
  rating_foil              text,
  rating_foil_year         integer,
  rating_saber             text,
  rating_saber_year        integer,
  fie_licence_id           text,
  national_licence_id      text,
  referee_qualification    text,
  competition_notes        text,

  -- kit
  equipment_owned          text[] not null default '{}',
  glove_size               text,
  jacket_size              text,
  shoe_size                text,
  blade_size               text,

  -- where they travel from, for the meetup planner. Coarse on purpose: the
  -- planner needs a neighborhood, not a doorstep, and a club roster is not a
  -- place to keep home addresses. The UI never asks for a street — it drops a
  -- pin or takes a district — and `home_label` is what other members see.
  home_label               text,
  home_lat                 numeric,
  home_lng                 numeric,
  travel_mode              text,
  -- Seats they can offer when they drive. 0 = never offers a lift.
  seats_offered            integer not null default 0,

  constraint profiles_role_check
    check (role = any (array['fencer','coach','admin'])),
  constraint profiles_status_check
    check (status = any (array['pending','active','rejected','on_hold','closed'])),
  constraint profiles_contact_method_check
    check (contact_method is null or contact_method = any (array['line','whatsapp','phone','email','signal'])),
  constraint profiles_handedness_check
    check (handedness is null or handedness = any (array['right','left','ambidextrous'])),
  constraint profiles_grip_check
    check (grip is null or grip = any (array['pistol','french','belgian','visconti','straight'])),
  constraint profiles_travel_mode_check
    check (travel_mode is null or travel_mode = any (array['walk','bike','transit','drive'])),
  constraint profiles_weapons_check
    check (weapons <@ array['epee','foil','saber']),
  constraint profiles_primary_weapon_check
    check (primary_weapon is null or primary_weapon = any (array['epee','foil','saber'])),
  -- A primary weapon the fencer does not fence is a data-entry slip that would
  -- otherwise quietly mis-sort every roster.
  constraint profiles_primary_weapon_is_fenced
    check (primary_weapon is null or primary_weapon = any (weapons)),
  constraint profiles_rating_epee_check
    check (rating_epee is null or rating_epee = any (array['A','B','C','D','E','U'])),
  constraint profiles_rating_foil_check
    check (rating_foil is null or rating_foil = any (array['A','B','C','D','E','U'])),
  constraint profiles_rating_saber_check
    check (rating_saber is null or rating_saber = any (array['A','B','C','D','E','U'])),
  constraint profiles_seats_offered_check
    check (seats_offered >= 0 and seats_offered <= 8),
  constraint profiles_height_check   check (height_cm  is null or (height_cm  between 50 and 260)),
  constraint profiles_weight_check   check (weight_kg  is null or (weight_kg  between 10 and 300)),
  constraint profiles_arm_span_check check (arm_span_cm is null or (arm_span_cm between 50 and 280)),
  -- A home pin is both coordinates or neither; one alone is a half-saved form
  -- that the planner would read as the middle of the Gulf of Guinea.
  constraint profiles_home_pin_complete
    check ((home_lat is null) = (home_lng is null)),
  constraint profiles_home_lat_check check (home_lat is null or (home_lat between -90 and 90)),
  constraint profiles_home_lng_check check (home_lng is null or (home_lng between -180 and 180)),
  constraint profiles_started_fencing_check
    check (started_fencing_on is null or started_fencing_on >= date '1900-01-01')
);

create index if not exists profiles_role_idx   on public.profiles (role);
create index if not exists profiles_status_idx on public.profiles (status);
create index if not exists profiles_parent_idx on public.profiles (parent_account) where parent_account is not null;


-- ── role helpers ─────────────────────────────────────────────────────────────
-- SECURITY DEFINER so a policy on `profiles` can ask about the caller's own row
-- without recursing through that table's own policies.

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path to 'public'
  as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_coach_or_admin() returns boolean
  language sql stable security definer set search_path to 'public'
  as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','coach')
  )
$$;

create or replace function public.is_active_user() returns boolean
  language sql stable security definer set search_path to 'public'
  as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active')
$$;

-- True when the write is coming from somebody signed in to the app, rather
-- than from the server.
--
-- Every "you may not edit this column" guard below has to ask. A trigger cannot
-- see who the caller is, only what auth.uid() says, and it says NULL for the
-- service role — which is the seed script, the edge functions, and the push
-- worker. Those have no self to protect and no privilege to escalate: they are
-- already trusted with everything, and RLS does not apply to them at all. A
-- guard that fires on them stops the server doing its job and protects nobody.
--
-- The anon role is NOT a hole here: it has no UPDATE policy on any of these
-- tables, so an anonymous request never reaches a trigger to be waved through.
create or replace function public.is_end_user() returns boolean
  language sql stable
  as $$ select auth.uid() is not null $$;

-- The account that pays for, and can read, this fencer's records — a parent
-- reading a junior's bouts and bills. Null for an ordinary adult member.
create or replace function public.my_parent_account() returns uuid
  language sql stable security definer set search_path to 'public'
  as $$
  select parent_account from public.profiles where id = auth.uid()
$$;

-- True when `p_id` is the caller, or a child account the caller owns. The
-- single predicate every "my records" policy is written in terms of.
create or replace function public.is_self_or_child(p_id uuid) returns boolean
  language sql stable security definer set search_path to 'public'
  as $$
  select p_id = auth.uid()
      or exists (
        select 1 from public.profiles
        where id = p_id and parent_account = auth.uid()
      )
$$;

grant execute on function public.is_admin()               to anon, authenticated, service_role;
grant execute on function public.is_end_user()            to anon, authenticated, service_role;
grant execute on function public.is_coach_or_admin()      to anon, authenticated, service_role;
grant execute on function public.is_active_user()         to anon, authenticated, service_role;
grant execute on function public.my_parent_account()      to anon, authenticated, service_role;
grant execute on function public.is_self_or_child(uuid)   to anon, authenticated, service_role;


-- ── profile lifecycle triggers ───────────────────────────────────────────────

create or replace function public.touch_updated_at() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- A new auth user gets a profile immediately, in 'pending'. Without this a
-- signed-up account has a session and no row, and every RLS policy in the
-- schema evaluates against null.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, new.raw_user_meta_data->>'name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in step with the authoritative copy in auth.users, so a
-- roster export and a password reset cannot disagree about where to write.
create or replace function public.sync_profile_email() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- A fencer may edit their own profile, but not their way into a role, an
-- approved status, or somebody else's family. Those are staff decisions, and a
-- policy cannot express "these columns but not those" — so a trigger does.
create or replace function public.block_self_privileged_profile_change() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if not public.is_end_user() or public.is_admin() then
    return new;
  end if;
  if new.role   is distinct from old.role
  or new.status is distinct from old.status
  or new.parent_account is distinct from old.parent_account then
    raise exception 'role, status and parent_account are set by an admin'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_block_self_privileged_change
  before update on public.profiles
  for each row execute function public.block_self_privileged_profile_change();

-- A family is one level deep: a parent account holds children, and a child
-- cannot itself be a parent. Two levels would make every "who can read this"
-- question recursive for no benefit any club has asked for.
create or replace function public.profiles_enforce_one_level_family() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if new.parent_account is not null then
    if new.parent_account = new.id then
      raise exception 'an account cannot be its own parent';
    end if;
    if exists (select 1 from public.profiles where id = new.parent_account and parent_account is not null) then
      raise exception 'families are one level deep: % already has a parent', new.parent_account;
    end if;
    if exists (select 1 from public.profiles where parent_account = new.id) then
      raise exception 'account % already holds children and cannot become a child', new.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_one_level_family
  before insert or update of parent_account on public.profiles
  for each row execute function public.profiles_enforce_one_level_family();

-- Stamp the moment a pending account became a real application (a name and a
-- way to reach them), so the admin queue can sort by how long someone has been
-- waiting rather than by when they first clicked sign up.
create or replace function public.maybe_set_application_submitted_at() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if new.application_submitted_at is null
     and new.status = 'pending'
     and coalesce(new.name, '') <> ''
     and coalesce(new.emergency_contact_phone, '') <> '' then
    new.application_submitted_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_stamp_application
  before insert or update on public.profiles
  for each row execute function public.maybe_set_application_submitted_at();


-- ── profiles RLS ─────────────────────────────────────────────────────────────

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (public.is_self_or_child(id));

-- Active members see each other, because a club roster is the point of a club.
-- The columns that are nobody else's business — medical notes, ID number,
-- emergency contact, home pin — are not filtered here (RLS is row-level) but by
-- the `roster` view below, which is what the app actually reads.
create policy profiles_select_roster on public.profiles
  for select to authenticated
  using (public.is_active_user() and status = 'active');

create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (public.is_coach_or_admin());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (public.is_self_or_child(id))
  with check (public.is_self_or_child(id));

create policy profiles_update_admin on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The roster every member-facing screen reads: who is in the club, what they
-- fence, which hand, and the neighborhood they come from. Not their medical
-- notes, ID number, emergency contact, date of birth or home coordinates.
--
-- security_invoker so the view is still filtered by the reader's own RLS: a
-- pending account sees nothing through it, exactly as it sees nothing without.
create or replace view public.roster
  with (security_invoker = true)
  as select
    id, name, nickname, avatar_url, role, status,
    handedness, weapons, primary_weapon, grip,
    height_cm, arm_span_cm, started_fencing_on,
    rating_epee, rating_epee_year,
    rating_foil, rating_foil_year,
    rating_saber, rating_saber_year,
    referee_qualification,
    home_label, travel_mode, seats_offered,
    created_at
  from public.profiles
  where status = 'active';

grant select on public.roster to authenticated;


-- ── audit trail ──────────────────────────────────────────────────────────────
-- Every privileged write, appended. Append-only in the strong sense: a trigger
-- rejects UPDATE and DELETE, so an admin who can do everything else still
-- cannot edit the record of what they did.

create table if not exists public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_email text,
  action      text not null,
  table_name  text not null,
  row_id      uuid,
  summary     text,
  before      jsonb,
  after       jsonb
);

create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_row_idx     on public.admin_audit_log (table_name, row_id);

create or replace function public.audit_log_no_mutations() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  raise exception 'admin_audit_log is append-only' using errcode = '42501';
end;
$$;

create trigger admin_audit_log_immutable
  before update or delete on public.admin_audit_log
  for each row execute function public.audit_log_no_mutations();

create or replace function public.audit_admin_write() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_row_id uuid;
begin
  begin
    v_row_id := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid);
  exception when others then
    v_row_id := null;
  end;

  insert into public.admin_audit_log (actor_id, actor_email, action, table_name, row_id, before, after)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    lower(tg_op),
    tg_table_name,
    v_row_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create policy audit_select_admin on public.admin_audit_log
  for select to authenticated using (public.is_admin());


-- ── staff notes ──────────────────────────────────────────────────────────────
-- Coaching notes about a member. Never visible to the member: a coach who has
-- to weigh their words is writing something other than a coaching note.

create table if not exists public.member_notes (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id  uuid not null references public.profiles(id) on delete cascade,
  author_id  uuid references public.profiles(id) on delete set null,
  -- Frozen at write time so deleting the author does not erase who said it.
  author_name text,
  body       text not null,
  pinned     boolean not null default false
);

create index if not exists member_notes_member_idx on public.member_notes (member_id, created_at desc);

create or replace function public.member_notes_freeze_author() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if new.author_name is null then
    new.author_name := (select coalesce(name, email) from public.profiles where id = new.author_id);
  end if;
  return new;
end;
$$;

create trigger member_notes_freeze_author_name
  before insert on public.member_notes
  for each row execute function public.member_notes_freeze_author();

create policy member_notes_staff on public.member_notes
  for all to authenticated
  using (public.is_coach_or_admin())
  with check (public.is_coach_or_admin());

create trigger member_notes_audit
  after insert or update or delete on public.member_notes
  for each row execute function public.audit_admin_write();
