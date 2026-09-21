-- ─────────────────────────────────────────────────────────────────────────────
-- Fees, what was paid, and the passes a club sells instead of charging per
-- session.
--
-- Money is recorded as a ledger, never as a balance. Every row is an event that
-- happened — a payment taken, a refund given, a pass punched — and the balance
-- is computed from them. The alternative, a `balance` column kept in step by
-- application code, is wrong the first time two writes interleave and there is
-- then no way to find out what it should have been.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── the price list ───────────────────────────────────────────────────────────

create table if not exists public.prices (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  label       text not null,
  amount      numeric not null,
  currency    text,
  -- 'session' for a drop-in, 'term' for a course, 'pass' for a multi-session
  -- card, 'membership' for the annual fee, 'loan' for club kit.
  unit        text not null default 'session',
  applies_to  text[] not null default '{}',
  active      boolean not null default true,
  sort_order  integer not null default 0,
  notes       text,

  constraint prices_amount_check check (amount >= 0),
  constraint prices_unit_check
    check (unit = any (array['session','term','pass','membership','loan','other'])),
  constraint prices_applies_to_check
    check (applies_to <@ array['practice','course','popup','tournament','interclub','social'])
);

create policy prices_select on public.prices
  for select to authenticated using (public.is_active_user());

create policy prices_write_admin on public.prices
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ── payments ─────────────────────────────────────────────────────────────────
-- Money that actually moved. A refund is a negative row, not a flag: it keeps
-- the ledger additive, so the sum of the column is always the truth.

create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  member_id   uuid not null references public.profiles(id) on delete cascade,
  -- Who actually handed over the money, when that is not the member (a parent
  -- paying for a junior). Null means the member paid for themselves.
  payer_id    uuid references public.profiles(id) on delete set null,
  booking_id  uuid references public.bookings(id) on delete set null,
  pass_id     uuid,   -- FK added after `passes` exists, below
  amount      numeric not null,
  currency    text,
  method      text not null default 'cash',
  reference   text,
  paid_on     date not null default (now() at time zone 'utc')::date,
  note        text,
  recorded_by uuid references public.profiles(id) on delete set null,

  constraint payments_method_check
    check (method = any (array['cash','transfer','linepay','card','jkopay','other'])),
  -- Zero is not a payment; it is a row somebody meant to delete.
  constraint payments_amount_nonzero check (amount <> 0)
);

create index if not exists payments_member_idx  on public.payments (member_id, paid_on desc);
create index if not exists payments_booking_idx on public.payments (booking_id) where booking_id is not null;

create policy payments_select_own on public.payments
  for select to authenticated
  using (public.is_self_or_child(member_id) or payer_id = auth.uid());

create policy payments_write_staff on public.payments
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());

create trigger payments_audit
  after insert or update or delete on public.payments
  for each row execute function public.audit_admin_write();


-- ── passes ───────────────────────────────────────────────────────────────────
-- A ten-session card, a term's unlimited training, an annual membership. The
-- thing most clubs actually sell, and the reason a per-booking price is not
-- enough on its own.

create table if not exists public.passes (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  member_id    uuid not null references public.profiles(id) on delete cascade,
  label        text not null,
  -- Null = unlimited within the date window (a term pass). A number = a punch
  -- card, and `punches` below is what draws it down.
  sessions     integer,
  valid_from   date not null default (now() at time zone 'utc')::date,
  valid_until  date,
  price_id     uuid references public.prices(id) on delete set null,
  amount       numeric,
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,

  constraint passes_sessions_check check (sessions is null or sessions > 0),
  constraint passes_window_check   check (valid_until is null or valid_until >= valid_from)
);

create index if not exists passes_member_idx on public.passes (member_id, valid_from desc);

alter table public.payments
  add constraint payments_pass_fk
  foreign key (pass_id) references public.passes(id) on delete set null;


create table if not exists public.pass_punches (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pass_id    uuid not null references public.passes(id) on delete cascade,
  event_id   uuid references public.events(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  -- +1 for a session used, -1 to give one back when a session is cancelled.
  -- Additive for the same reason refunds are negative payments.
  delta      integer not null default 1,
  note       text,
  recorded_by uuid references public.profiles(id) on delete set null,

  constraint pass_punches_delta_check check (delta <> 0 and delta between -5 and 5)
);

create index if not exists pass_punches_pass_idx on public.pass_punches (pass_id, created_at desc);

-- What is left on a card. Computed, never stored.
create or replace view public.pass_balances
  with (security_invoker = true)
  as select
    p.id as pass_id,
    p.member_id,
    p.label,
    p.sessions,
    p.valid_from,
    p.valid_until,
    coalesce(sum(pp.delta), 0)::integer as used,
    case when p.sessions is null then null
         else p.sessions - coalesce(sum(pp.delta), 0)::integer end as remaining,
    (p.valid_until is not null and p.valid_until < (now() at time zone 'utc')::date) as expired
  from public.passes p
  left join public.pass_punches pp on pp.pass_id = p.id
  group by p.id;

grant select on public.pass_balances to authenticated;

-- A punch card cannot go negative, and an expired card cannot be punched at
-- all. Both checked here because both are the kind of thing a busy coach does
-- by accident at the door.
create or replace function public.pass_punches_guard() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_sessions integer;
  v_until    date;
  v_used     integer;
begin
  select sessions, valid_until into v_sessions, v_until
    from public.passes where id = new.pass_id for update;

  if v_until is not null and v_until < (now() at time zone 'utc')::date and new.delta > 0 then
    raise exception 'this pass expired on %', v_until using errcode = '23514';
  end if;

  if v_sessions is not null and new.delta > 0 then
    select coalesce(sum(delta), 0) into v_used
      from public.pass_punches where pass_id = new.pass_id and id <> new.id;
    if v_used + new.delta > v_sessions then
      raise exception 'this pass has no sessions left (% of %)', v_used, v_sessions
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger pass_punches_check_balance
  before insert or update on public.pass_punches
  for each row execute function public.pass_punches_guard();

create policy passes_select_own on public.passes
  for select to authenticated using (public.is_self_or_child(member_id));

create policy passes_write_staff on public.passes
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());

create policy pass_punches_select_own on public.pass_punches
  for select to authenticated
  using (exists (
    select 1 from public.passes p
    where p.id = pass_punches.pass_id and public.is_self_or_child(p.member_id)
  ));

create policy pass_punches_write_staff on public.pass_punches
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


-- ── discounts ────────────────────────────────────────────────────────────────

create table if not exists public.discounts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  label       text not null,
  kind        text not null default 'percent',
  value       numeric not null,
  -- Who it is for: 'student', 'sibling', 'coach', 'returning'. Free text
  -- because every club's list is different and none of them are stable.
  eligibility text,
  active      boolean not null default true,
  notes       text,

  constraint discounts_kind_check check (kind = any (array['percent','amount'])),
  constraint discounts_value_check
    check (value > 0 and (kind <> 'percent' or value <= 100))
);

create table if not exists public.booking_discounts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  discount_id uuid not null references public.discounts(id) on delete restrict,
  status      text not null default 'requested',
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz,
  note        text,

  constraint booking_discounts_status_check
    check (status = any (array['requested','approved','declined'])),
  constraint booking_discounts_once unique (booking_id, discount_id)
);

create or replace function public.booking_discounts_stamp_decision() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if new.status is distinct from coalesce(old.status, 'requested') and new.status <> 'requested' then
    new.decided_at := now();
    new.decided_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger booking_discounts_stamp
  before insert or update of status on public.booking_discounts
  for each row execute function public.booking_discounts_stamp_decision();

create policy discounts_select on public.discounts
  for select to authenticated using (public.is_active_user());

create policy discounts_write_admin on public.discounts
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy booking_discounts_select_own on public.booking_discounts
  for select to authenticated
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_discounts.booking_id and public.is_self_or_child(b.member_id)
  ));

-- A member may ask for a discount. Only staff may grant one — the guard is the
-- status column, and a policy cannot name columns, so the trigger says it.
create policy booking_discounts_request_own on public.booking_discounts
  for insert to authenticated
  with check (exists (
    select 1 from public.bookings b
    where b.id = booking_discounts.booking_id and public.is_self_or_child(b.member_id)
  ));

create or replace function public.booking_discounts_only_staff_decide() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if not public.is_end_user() or public.is_coach_or_admin() then
    return new;
  end if;
  if new.status <> 'requested' then
    raise exception 'a discount is granted by the club' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger booking_discounts_decision_guard
  before insert or update on public.booking_discounts
  for each row execute function public.booking_discounts_only_staff_decide();

create policy booking_discounts_write_staff on public.booking_discounts
  for all to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());


-- What a member owes, and what they have paid. The one place the app reads a
-- balance from, so there is exactly one definition of it.
create or replace view public.member_balances
  with (security_invoker = true)
  as select
    p.id as member_id,
    coalesce((select sum(b.amount_due)  from public.bookings b
              where b.member_id = p.id and b.status <> 'cancelled'), 0) as owed,
    coalesce((select sum(pm.amount)     from public.payments pm
              where pm.member_id = p.id), 0)                            as paid,
    coalesce((select sum(b.amount_due)  from public.bookings b
              where b.member_id = p.id and b.status <> 'cancelled'), 0)
      - coalesce((select sum(pm.amount) from public.payments pm
              where pm.member_id = p.id), 0)                            as outstanding
  from public.profiles p;

grant select on public.member_balances to authenticated;
