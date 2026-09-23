-- ─────────────────────────────────────────────────────────────────────────────
-- Waivers a member signs before they fence, and the record that they did.
--
-- Ported from the dive-shop app, with its rules:
--
--   • A waiver is signed by typing your name and ticking that you agree. The
--     signature stores the title, the text and a SHA-256 of it as they stood
--     at that moment, so the record proves what was agreed to, not what the
--     waiver says today.
--   • A waiver is `annual` (good for a year, across events) or `per_event`.
--   • Publishing a new version makes every older signature out of date.
--   • An admin can record a paper form signed in person.
--
-- Two things the original did not have, because a fencing club needs them:
-- a parent signs for a junior (the original could only e-sign as yourself),
-- and signing is REQUIRED before a member registers — enforced by the booking
-- trigger, not only shown as a warning. Fencing is a combat sport with a
-- blade; "you can sign it later" is not an answer the club wants to give.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.waivers
  add column if not exists cadence    text not null default 'annual',
  add column if not exists active     boolean not null default true,
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.waivers add constraint waivers_cadence_check
  check (cadence = any (array['annual','per_event']));
alter table public.waivers add constraint waivers_title_check check (length(btrim(title)) > 0);
alter table public.waivers add constraint waivers_body_check  check (length(btrim(body)) > 0);

-- A published waiver's words are fixed. Changing them is publishing version
-- N+1; otherwise a signature's waiver_id would point at text nobody signed.
create or replace function public.waivers_freeze_published() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if old.published_at is not null and (
       new.body    is distinct from old.body
    or new.title   is distinct from old.title
    or new.code    is distinct from old.code
    or new.version is distinct from old.version
    or new.published_at is distinct from old.published_at) then
    raise exception 'a published waiver cannot be edited; publish a new version'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger waivers_freeze_published
  before update on public.waivers
  for each row execute function public.waivers_freeze_published();

create trigger waivers_audit
  after insert or update or delete on public.waivers
  for each row execute function public.audit_admin_write();


-- ── signatures ───────────────────────────────────────────────────────────────

alter table public.waiver_signatures
  add column if not exists waiver_code    text,
  add column if not exists waiver_version integer,
  add column if not exists title_snapshot text,
  add column if not exists content_sha256 text,
  add column if not exists method         text not null default 'e_signed',
  -- Who pressed the button: the member, their parent, or the admin recording
  -- a paper form.
  add column if not exists signed_by      uuid references public.profiles(id) on delete set null;

update public.waiver_signatures s
   set waiver_code = w.code, waiver_version = w.version, title_snapshot = w.title,
       content_sha256 = encode(extensions.digest(s.body_snapshot, 'sha256'), 'hex')
  from public.waivers w where w.id = s.waiver_id and s.waiver_code is null;

alter table public.waiver_signatures alter column waiver_code    set not null;
alter table public.waiver_signatures alter column waiver_version set not null;
alter table public.waiver_signatures add constraint waiver_signatures_method_check
  check (method = any (array['e_signed','in_person']));
alter table public.waiver_signatures add constraint waiver_signatures_name_check
  check (length(btrim(signed_name)) between 1 and 200);

-- An annual waiver is signed again every year, as a new row. The old
-- uniqueness rules would refuse the second year's signature.
alter table public.waiver_signatures drop constraint if exists waiver_signatures_once_per_event;
drop index if exists public.waiver_signatures_once_general;
create index if not exists waiver_signatures_member_code_idx
  on public.waiver_signatures (member_id, waiver_code, signed_at desc);

-- Signing goes through sign_waiver(), which takes the snapshot on the server.
-- A direct insert would let the client write whatever body it liked into the
-- record of what was signed.
drop policy if exists waiver_signatures_insert_own on public.waiver_signatures;


-- ── which waivers a member still owes ────────────────────────────────────────

-- Under 18 by date of birth, or a junior on a parent's account. The guardian
-- consent applies to them and to nobody else.
create or replace function public.is_minor(p_member_id uuid) returns boolean
  language sql stable security definer set search_path to 'public'
  as $$
  select coalesce(
    (select parent_account is not null
            or (date_of_birth is not null and date_of_birth > public.club_today() - interval '18 years')
       from public.profiles where id = p_member_id),
    false)
$$;

-- The latest published, active version of each waiver.
create or replace view public.current_waivers
  with (security_invoker = true)
  as select distinct on (code) *
  from public.waivers
  where published_at is not null and active
  order by code, version desc;

grant select on public.current_waivers to authenticated;

-- Every current waiver this member must have signed for this event and has
-- not: one that applies to the event's kind (and to a minor, if it needs a
-- guardian), with no signature of this version or later that is still good —
-- within a year for an annual waiver, for this very event for a per-event one.
-- 365 days is ANNUAL_WAIVER_VALID_DAYS in src/lib/waivers.ts.
create or replace function public.missing_waivers(p_member_id uuid, p_event_id uuid)
  returns setof public.waivers
  language sql stable security definer set search_path to 'public'
  as $$
  select w.* from public.waivers w
  join public.events e on e.id = p_event_id
  where w.id in (select id from public.current_waivers)
    and e.kind = any (w.applies_to)
    and (not w.requires_guardian or public.is_minor(p_member_id))
    and not exists (
      select 1 from public.waiver_signatures s
      where s.member_id = p_member_id
        and s.waiver_code = w.code
        and s.waiver_version >= w.version
        and case when w.cadence = 'per_event' then s.event_id = p_event_id
                 else s.signed_at > now() - interval '365 days' end)
$$;

-- Internal: the booking trigger asks it about anyone. The app asks through
-- my_missing_waivers, which only answers about yourself or your juniors, or
-- about anyone for staff.
revoke execute on function public.missing_waivers(uuid, uuid) from public, anon, authenticated;

create or replace function public.my_missing_waivers(p_member_id uuid, p_event_id uuid)
  returns setof public.waivers
  language sql stable security definer set search_path to 'public'
  as $$
  select * from public.missing_waivers(p_member_id, p_event_id)
  where public.is_self_or_child(p_member_id) or public.is_coach_or_admin()
$$;

grant execute on function public.my_missing_waivers(uuid, uuid) to authenticated;


-- ── signing ──────────────────────────────────────────────────────────────────

create or replace function public.sign_waiver(
  p_waiver_id     uuid,
  p_member_id     uuid,
  p_signed_name   text,
  p_guardian_name text default null,
  p_event_id      uuid default null
) returns public.waiver_signatures
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_waiver public.waivers;
  v_row    public.waiver_signatures;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not public.is_self_or_child(p_member_id) then
    raise exception 'you can sign for yourself or your own juniors' using errcode = '42501';
  end if;
  if coalesce(btrim(p_signed_name), '') = '' then
    raise exception 'type your full name to sign' using errcode = '23514';
  end if;

  select * into v_waiver from public.waivers where id = p_waiver_id;
  if v_waiver.id is null or v_waiver.id not in (select id from public.current_waivers) then
    raise exception 'that is not the current version of this waiver' using errcode = '23514';
  end if;
  if v_waiver.requires_guardian and coalesce(btrim(p_guardian_name), '') = '' then
    raise exception 'a parent or guardian signs this one: type their name' using errcode = '23514';
  end if;
  if v_waiver.cadence = 'per_event' and p_event_id is null then
    raise exception 'this waiver is signed for a specific event' using errcode = '23514';
  end if;

  insert into public.waiver_signatures (
    waiver_id, member_id, event_id, signed_name, guardian_name,
    body_snapshot, waiver_code, waiver_version, title_snapshot, content_sha256,
    method, signed_by
  ) values (
    v_waiver.id, p_member_id,
    case when v_waiver.cadence = 'per_event' then p_event_id end,
    btrim(p_signed_name), nullif(btrim(coalesce(p_guardian_name, '')), ''),
    v_waiver.body, v_waiver.code, v_waiver.version, v_waiver.title,
    encode(extensions.digest(v_waiver.body, 'sha256'), 'hex'),
    'e_signed', auth.uid()
  ) returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.sign_waiver(uuid, uuid, text, text, uuid) to authenticated;

-- A paper form signed at the door. Admin only; recorded against the member
-- with the same snapshot, so the record reads the same either way.
create or replace function public.record_paper_waiver(
  p_waiver_id     uuid,
  p_member_id     uuid,
  p_signed_name   text,
  p_guardian_name text default null,
  p_event_id      uuid default null
) returns public.waiver_signatures
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_waiver public.waivers;
  v_row    public.waiver_signatures;
begin
  if not public.is_admin() then
    raise exception 'only an admin records a paper waiver' using errcode = '42501';
  end if;
  if coalesce(btrim(p_signed_name), '') = '' then
    raise exception 'the name as signed on the paper form is required' using errcode = '23514';
  end if;
  select * into v_waiver from public.waivers where id = p_waiver_id and published_at is not null;
  if v_waiver.id is null then
    raise exception 'no such published waiver' using errcode = '23514';
  end if;

  insert into public.waiver_signatures (
    waiver_id, member_id, event_id, signed_name, guardian_name,
    body_snapshot, waiver_code, waiver_version, title_snapshot, content_sha256,
    method, signed_by
  ) values (
    v_waiver.id, p_member_id,
    case when v_waiver.cadence = 'per_event' then p_event_id end,
    btrim(p_signed_name), nullif(btrim(coalesce(p_guardian_name, '')), ''),
    v_waiver.body, v_waiver.code, v_waiver.version, v_waiver.title,
    encode(extensions.digest(v_waiver.body, 'sha256'), 'hex'),
    'in_person', auth.uid()
  ) returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.record_paper_waiver(uuid, uuid, text, text, uuid) to authenticated;


-- ── terms of use ─────────────────────────────────────────────────────────────
-- Same rule as a waiver: a published version's words are fixed.

create or replace function public.terms_freeze_published() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if old.published_at is not null and (
       new.body is distinct from old.body
    or new.version is distinct from old.version
    or new.published_at is distinct from old.published_at) then
    raise exception 'published terms cannot be edited; publish a new version'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger terms_freeze_published
  before update on public.terms
  for each row execute function public.terms_freeze_published();
