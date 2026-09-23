-- ─────────────────────────────────────────────────────────────────────────────
-- Registration, what it costs, how it is paid, and what happens when it is
-- cancelled.
--
-- Ported from the dive-shop app this one shares a stack with, and deliberately
-- close to it, because its rules have already met real customers:
--
--   • A price tier carries a fixed deposit. Both are FROZEN onto the booking
--     when it is made, so editing the price list never changes what somebody
--     already agreed to pay.
--   • A booking is `pending` until what has been paid covers the deposit
--     (clamped to what is owed), then `confirmed`. A free event confirms at
--     once. A full event waitlists.
--   • Money is a ledger. What is owed is the frozen price plus signed
--     amendments; what is paid is the sum of payments that have not been
--     voided. Nothing stores a balance.
--   • Refunds are account credit, issued by the database when a booking is
--     cancelled, by the four cases in `bookings_credit_on_cancel` below. Cash
--     goes back only when an admin records it.
--
-- Where this differs from the original, it says so at the spot.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── the club's clock ─────────────────────────────────────────────────────────
-- "Cancel by the 12th" means the 12th in Taipei, not in UTC. SQL cannot read
-- piste.config.ts, so the zone is restated here, and an integration test
-- asserts the two agree.

create or replace function public.club_timezone() returns text
  language sql immutable
  as $$ select 'Asia/Taipei'::text $$;

create or replace function public.club_today() returns date
  language sql stable
  as $$ select (now() at time zone public.club_timezone())::date $$;


-- ── prices: a deposit per tier ───────────────────────────────────────────────

alter table public.prices
  add column if not exists deposit_amount numeric;

alter table public.prices
  add constraint prices_deposit_check
    check (deposit_amount is null or (deposit_amount >= 0 and deposit_amount <= amount));


-- ── cancellation policies ────────────────────────────────────────────────────
-- The words a member agrees to when they register, and one rule the database
-- acts on: whether the deposit comes back.

create table if not exists public.cancellation_policies (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  title              text not null,
  body               text not null,
  -- False keeps the deposit when a member cancels, even in time. Cancelling
  -- the whole event always refunds it: the club's decision, the club's cost.
  deposit_refundable boolean not null default true,
  active             boolean not null default true,

  constraint cancellation_policies_title_check check (length(btrim(title)) > 0),
  constraint cancellation_policies_body_check  check (length(btrim(body)) > 0)
);

create policy cancellation_policies_select on public.cancellation_policies
  for select to authenticated using (public.is_active_user());
create policy cancellation_policies_write_admin on public.cancellation_policies
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create trigger cancellation_policies_audit
  after insert or update or delete on public.cancellation_policies
  for each row execute function public.audit_admin_write();


-- ── payment methods ──────────────────────────────────────────────────────────
-- How a member can pay, in the club's words: which account to transfer to,
-- which LINE Pay ID. Admin-authored rows rather than config, for the same
-- reason contact details are — a bank account changes without a deploy.
--
-- The original also carried a card surcharge per method. A club taking cash
-- and transfers has no surcharge, so there is none here.

create table if not exists public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  key          text not null unique,
  label        text not null,
  instructions text,
  active       boolean not null default true,
  sort_order   integer not null default 0,

  constraint payment_methods_key_check   check (key ~ '^[a-z0-9_]{1,50}$' and key <> 'account_credit'),
  constraint payment_methods_label_check check (length(btrim(label)) between 1 and 100)
);

create policy payment_methods_select on public.payment_methods
  for select to authenticated using (public.is_active_user());
create policy payment_methods_write_admin on public.payment_methods
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.payment_methods (key, label, instructions, sort_order) values
  ('cash',     'Cash',          'Hand it to a coach at any session.', 10),
  ('transfer', 'Bank transfer', null,                                  20),
  ('linepay',  'LINE Pay',      null,                                  30)
on conflict (key) do nothing;


-- ── events: a price tier, a policy, and whether it takes registrations ───────

-- Restrict, not set null: deleting a price tier that events still point at
-- would quietly make every one of them free to register for. An admin retires
-- a tier by marking it inactive; the delete is for a tier nothing uses.
alter table public.events
  add column if not exists price_id          uuid references public.prices(id) on delete restrict,
  add column if not exists cancel_policy_id  uuid references public.cancellation_policies(id) on delete restrict,
  add column if not exists registration_open boolean not null default true;

create index if not exists events_price_idx on public.events (price_id) where price_id is not null;

-- An event keeps its venue. Deleting a venue out from under upcoming events
-- would turn every one of them into "venue to be decided" without a word; the
-- admin archives it instead, and the delete is refused.
alter table public.events drop constraint events_venue_id_fkey;
alter table public.events add constraint events_venue_id_fkey
  foreign key (venue_id) references public.venues(id) on delete restrict;

-- An event with bookings is cancelled, never deleted: deleting it would take
-- every booking with it, and with them the record of who paid.
alter table public.bookings drop constraint bookings_event_id_fkey;
alter table public.bookings add constraint bookings_event_id_fkey
  foreign key (event_id) references public.events(id) on delete restrict;

-- The coach guard, restated to lock the new columns. Its own comment promised
-- a new column would be locked by default; it listed columns positively, so it
-- was not, and price_id would have been a coach's to change.
create or replace function public.events_coach_may_only_move_venue() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if not public.is_end_user() or public.is_admin() then
    return new;
  end if;

  if new.kind                  is distinct from old.kind
  or new.admin_title           is distinct from old.admin_title
  or new.display_title         is distinct from old.display_title
  or new.calendar_title        is distinct from old.calendar_title
  or new.start_date            is distinct from old.start_date
  or new.end_date              is distinct from old.end_date
  or new.course_days           is distinct from old.course_days
  or new.capacity              is distinct from old.capacity
  or new.price_id              is distinct from old.price_id
  or new.cancel_policy_id      is distinct from old.cancel_policy_id
  or new.cancel_date           is distinct from old.cancel_date
  or new.full_payment_deadline is distinct from old.full_payment_deadline
  or new.registration_open     is distinct from old.registration_open
  or new.is_private            is distinct from old.is_private
  or new.cancelled_at          is distinct from old.cancelled_at then
    raise exception 'a coach may move an event or change its notes; the rest is an admin change'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- The event's own price and currency columns are gone: the price is the tier
-- it points at, and what a member owes is frozen on their booking.
alter table public.events drop column if exists price;
alter table public.events drop column if exists currency;


-- ── bookings ─────────────────────────────────────────────────────────────────

-- The old guard names amount_paid; replace it before the column goes.
drop trigger if exists bookings_member_edit_guard on public.bookings;
drop function if exists public.bookings_block_member_money_edits();
drop trigger if exists bookings_waitlist_when_full on public.bookings;
drop function if exists public.set_waitlisted_when_event_full();

-- A stored "amount paid" is a balance, and this schema does not keep balances.
alter table public.bookings drop column if exists amount_paid;

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status = any (array['pending','confirmed','waitlisted','cancelled','no_show']));
alter table public.bookings alter column status set default 'pending';

alter table public.bookings
  add column if not exists deposit                    numeric,
  add column if not exists policy_acked_at            timestamptz,
  add column if not exists refund_requested_at        timestamptz,
  add column if not exists cancelled_by               uuid references public.profiles(id) on delete set null,
  -- Set when the booking was cancelled BY ITS EVENT being cancelled, holding
  -- what it was before. Restoring the event restores exactly those bookings.
  add column if not exists status_before_event_cancel text,
  -- An admin's decision about money left on a cancelled booking: kept as a
  -- fee, refunded in cash, or turned into credit. Settled means decided.
  add column if not exists cancellation_settled_at    timestamptz,
  add column if not exists cancellation_settled_by    uuid references public.profiles(id) on delete set null,
  add column if not exists cancellation_settled_note  text;

alter table public.bookings add constraint bookings_deposit_check
  check (deposit is null or deposit >= 0);

-- One live booking per member per event. A member who cancelled may register
-- again, which the old unconditional unique constraint refused.
alter table public.bookings drop constraint bookings_unique_member_event;
-- Staff read, book and change bookings, and never delete one: a deleted
-- booking takes the link between its payments and the event with it.
-- Cancelling is how a booking ends.
drop policy if exists bookings_all_staff on public.bookings;
create policy bookings_select_staff on public.bookings
  for select to authenticated using (public.is_coach_or_admin());
create policy bookings_insert_staff on public.bookings
  for insert to authenticated with check (public.is_coach_or_admin());
create policy bookings_update_staff on public.bookings
  for update to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());

create unique index if not exists bookings_one_live_per_member
  on public.bookings (event_id, member_id) where status <> 'cancelled';

create index if not exists bookings_refund_requested_idx
  on public.bookings (refund_requested_at) where refund_requested_at is not null and status <> 'cancelled';


-- ── amendments: signed changes to what a booking owes ────────────────────────
-- A discount, a surcharge for a borrowed blade, a goodwill write-off. Positive
-- adds to what is owed. Rows are immutable: correcting one is another row.

create table if not exists public.booking_amendments (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  amount      numeric not null,
  note        text not null,
  created_by  uuid references public.profiles(id) on delete set null,

  constraint booking_amendments_amount_check check (amount <> 0),
  constraint booking_amendments_note_check   check (length(btrim(note)) between 1 and 1000)
);

create index if not exists booking_amendments_booking_idx on public.booking_amendments (booking_id);

create policy booking_amendments_select_own on public.booking_amendments
  for select to authenticated
  using (exists (select 1 from public.bookings b
                 where b.id = booking_amendments.booking_id
                   and (public.is_self_or_child(b.member_id) or b.payer_id = auth.uid())));
create policy booking_amendments_select_staff on public.booking_amendments
  for select to authenticated using (public.is_coach_or_admin());
create policy booking_amendments_insert_admin on public.booking_amendments
  for insert to authenticated
  with check (public.is_admin() and created_by = auth.uid());

create trigger booking_amendments_audit
  after insert on public.booking_amendments
  for each row execute function public.audit_admin_write();


-- ── payments ─────────────────────────────────────────────────────────────────
-- Kept signed (a refund is a negative row) rather than the original's
-- positive-amount-plus-status, because this schema already was, and the sum of
-- the column staying the truth is worth more than matching. Voiding is the one
-- in-place change: a payment recorded against the wrong booking is voided and
-- recorded again, and both rows stay.

alter table public.payments
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete set null;

-- The method is a payment_methods key, or 'account_credit' for credit applied
-- by the database. A key, not a foreign key: retiring a method must not
-- rewrite the history of how people paid.
alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method ~ '^[a-z0-9_]{1,50}$');

-- Staff may record and void. Nobody deletes a payment, and nobody edits one
-- except to void it.
drop policy if exists payments_write_staff on public.payments;
create policy payments_select_staff on public.payments
  for select to authenticated using (public.is_coach_or_admin());
create policy payments_insert_staff on public.payments
  for insert to authenticated
  with check (public.is_coach_or_admin() and recorded_by = auth.uid());
create policy payments_update_staff on public.payments
  for update to authenticated
  using (public.is_coach_or_admin()) with check (public.is_coach_or_admin());

create or replace function public.payments_only_void() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if new.id         is distinct from old.id
  or new.member_id  is distinct from old.member_id
  or new.payer_id   is distinct from old.payer_id
  or new.booking_id is distinct from old.booking_id
  or new.pass_id    is distinct from old.pass_id
  or new.amount     is distinct from old.amount
  or new.method     is distinct from old.method
  or new.paid_on    is distinct from old.paid_on
  or new.recorded_by is distinct from old.recorded_by
  or new.created_at is distinct from old.created_at then
    raise exception 'a payment is voided, not edited: void it and record the right one'
      using errcode = '42501';
  end if;
  if old.voided_at is not null and new.voided_at is null then
    raise exception 'a voided payment stays voided' using errcode = '42501';
  end if;
  if new.voided_at is not null and old.voided_at is null then
    new.voided_at := now();
    new.voided_by := coalesce(auth.uid(), new.voided_by);
  end if;
  return new;
end;
$$;

create trigger payments_void_only
  before update on public.payments
  for each row execute function public.payments_only_void();


-- ── credits: the member's account ────────────────────────────────────────────
-- Signed ledger. Positive is money the club holds for the member; an
-- admin_refund (credit paid back in cash) is negative. `open` rows are
-- spendable; `settled` ones have been spent or reclaimed.

create table if not exists public.credits (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  member_id    uuid not null references public.profiles(id) on delete cascade,
  booking_id   uuid references public.bookings(id) on delete set null,
  amount       numeric not null,
  reason       text not null,
  source       text not null default 'manual',
  status       text not null default 'open',
  created_by   uuid references public.profiles(id) on delete set null,
  settled_at   timestamptz,
  settled_by   uuid references public.profiles(id) on delete set null,
  settled_note text,

  constraint credits_status_check check (status = any (array['open','settled'])),
  constraint credits_source_check check (source = any (array[
    'manual',                        -- an admin granted it
    'event_cancellation',            -- the club cancelled the event
    'booking_cancellation_return',   -- the member cancelled in time
    'carry_forward',                 -- the unspent rest of a partly used row
    'return_reclaimed',              -- a return taken back when a booking was restored
    'admin_refund'                   -- credit paid back in cash (negative)
  ])),
  constraint credits_amount_check
    check (case when source = 'admin_refund' then amount < 0 else amount > 0 end),
  constraint credits_reason_check check (length(btrim(reason)) > 0)
);

create index if not exists credits_member_open_idx on public.credits (member_id) where status = 'open';
create index if not exists credits_booking_idx on public.credits (booking_id, source) where booking_id is not null;

create policy credits_select_own on public.credits
  for select to authenticated using (public.is_self_or_child(member_id));
create policy credits_select_staff on public.credits
  for select to authenticated using (public.is_coach_or_admin());
create policy credits_insert_admin on public.credits
  for insert to authenticated with check (public.is_admin());
create policy credits_update_admin on public.credits
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.credits_stamp_settled() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if new.status = 'settled' and old.status = 'open' then
    new.settled_at := now();
    new.settled_by := coalesce(auth.uid(), new.settled_by);
  elsif new.status = 'open' and old.status = 'settled' then
    new.settled_at := null;
    new.settled_by := null;
    new.settled_note := null;
  end if;
  return new;
end;
$$;

create trigger credits_stamp_settled
  before update on public.credits
  for each row execute function public.credits_stamp_settled();

create trigger credits_audit
  after insert or update on public.credits
  for each row execute function public.audit_admin_write();


-- ── the arithmetic, once ─────────────────────────────────────────────────────

create or replace function public.booking_net_paid(p_booking_id uuid) returns numeric
  language sql stable security definer set search_path to 'public'
  as $$
  select coalesce(sum(amount), 0) from public.payments
  where booking_id = p_booking_id and voided_at is null
$$;

create or replace function public.booking_owed(p_booking_id uuid) returns numeric
  language sql stable security definer set search_path to 'public'
  as $$
  select b.amount_due + coalesce((select sum(a.amount) from public.booking_amendments a
                                  where a.booking_id = b.id), 0)
  from public.bookings b where b.id = p_booking_id
$$;

-- Money given back on a cancelled booking. Only these sources count as "this
-- booking's money was returned"; a manual credit tied to it does not.
create or replace function public.booking_returned(p_booking_id uuid) returns numeric
  language sql stable security definer set search_path to 'public'
  as $$
  select coalesce(sum(amount), 0) from public.credits
  where booking_id = p_booking_id
    and source in ('event_cancellation', 'booking_cancellation_return')
$$;

revoke execute on function public.booking_net_paid(uuid) from public, anon, authenticated;
revoke execute on function public.booking_owed(uuid)     from public, anon, authenticated;
revoke execute on function public.booking_returned(uuid) from public, anon, authenticated;

-- Every booking's money, the one place the app reads it from. security_invoker,
-- so a member sees their own rows and staff see everyone's.
create or replace view public.booking_balances
  with (security_invoker = true)
  as
  with sums as (
    select
      b.id, b.event_id, b.member_id, b.payer_id, b.status, b.deposit,
      b.cancellation_settled_at,
      b.amount_due + coalesce((select sum(a.amount) from public.booking_amendments a
                               where a.booking_id = b.id), 0)        as owed,
      coalesce((select sum(p.amount) from public.payments p
                where p.booking_id = b.id and p.voided_at is null), 0) as paid,
      coalesce((select sum(c.amount) from public.credits c
                where c.booking_id = b.id
                  and c.source in ('event_cancellation','booking_cancellation_return')), 0) as returned
    from public.bookings b
  )
  select
    id as booking_id, event_id, member_id, payer_id, status,
    owed, paid, returned,
    -- Clamped to what is owed: an amendment can bring the price under the
    -- deposit, and nobody owes a deposit larger than the whole bill.
    least(coalesce(deposit, 0), greatest(owed, 0))                              as deposit,
    case when status = 'cancelled' then 0
         else greatest(least(coalesce(deposit, 0), greatest(owed, 0)) - paid, 0) end as deposit_due,
    case when status = 'cancelled' then 0 else owed - paid end                  as balance,
    -- Money still sitting on a cancelled booking that nobody has decided about:
    -- paid in, not returned, not settled. The admin's to-do list.
    case when status = 'cancelled' and cancellation_settled_at is null
         then greatest(paid - returned, 0) else 0 end                           as unsettled
  from sums;

grant select on public.booking_balances to authenticated;

-- What a member owes across everything, and what the club holds for them.
drop view if exists public.member_balances;
create view public.member_balances
  with (security_invoker = true)
  as select
    p.id as member_id,
    coalesce((select sum(bb.balance) from public.booking_balances bb
              where bb.member_id = p.id and bb.balance > 0), 0) as outstanding,
    coalesce((select sum(c.amount) from public.credits c
              where c.member_id = p.id and c.status = 'open'), 0) as account_credit
  from public.profiles p;

grant select on public.member_balances to authenticated;


-- ── places taken ─────────────────────────────────────────────────────────────
-- A pending booking holds its place now, so "how full is it" counts pending
-- and confirmed. Replaces the confirmed-only counts, which nothing read.
drop function if exists public.event_confirmed_count(uuid);
drop function if exists public.event_confirmed_counts(uuid[]);

create or replace function public.event_places_taken(p_event_ids uuid[])
  returns table (event_id uuid, taken integer)
  language sql stable security definer set search_path to 'public'
  as $$
  select b.event_id, count(*)::integer
  from public.bookings b
  where b.event_id = any (p_event_ids) and b.status in ('pending', 'confirmed')
  group by b.event_id
$$;

revoke execute on function public.event_places_taken(uuid[]) from public, anon;
grant execute on function public.event_places_taken(uuid[]) to authenticated;


-- ── pending ⇄ confirmed, by the money ────────────────────────────────────────
-- A booking is confirmed once what has been paid covers the deposit (clamped
-- to what is owed), and falls back to pending if a void takes that away. A
-- zero-price booking is covered by nothing, so it confirms at once.

create or replace function public.sync_booking_status(p_booking_id uuid) returns void
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_status  text;
  v_deposit numeric;
  v_owed    numeric;
  v_paid    numeric;
  v_needed  numeric;
begin
  select status, coalesce(deposit, 0) into v_status, v_deposit
    from public.bookings where id = p_booking_id for update;
  if v_status not in ('pending', 'confirmed') then
    return;
  end if;
  v_owed := public.booking_owed(p_booking_id);
  v_paid := public.booking_net_paid(p_booking_id);
  -- With no deposit on the tier, the whole price is what confirms it.
  v_needed := case when v_deposit > 0 then least(v_deposit, greatest(v_owed, 0))
                   else greatest(v_owed, 0) end;

  if v_status = 'pending' and v_paid >= v_needed then
    update public.bookings set status = 'confirmed' where id = p_booking_id;
  elsif v_status = 'confirmed' and v_paid < v_needed then
    update public.bookings set status = 'pending' where id = p_booking_id;
  end if;
end;
$$;

revoke execute on function public.sync_booking_status(uuid) from public, anon, authenticated;

create or replace function public.payments_sync_booking() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
begin
  if coalesce(new.booking_id, old.booking_id) is not null then
    perform public.sync_booking_status(coalesce(new.booking_id, old.booking_id));
  end if;
  return null;
end;
$$;

create trigger payments_sync_booking
  after insert or update on public.payments
  for each row execute function public.payments_sync_booking();

create or replace function public.amendments_sync_booking() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
begin
  perform public.sync_booking_status(new.booking_id);
  return null;
end;
$$;

create trigger booking_amendments_sync_booking
  after insert on public.booking_amendments
  for each row execute function public.amendments_sync_booking();


-- ── making a booking ─────────────────────────────────────────────────────────
-- What a booking costs is decided HERE, from the event's price tier, whatever
-- the client sent. A member cannot book themselves in at a price of their
-- choosing, and staff adjust a price with an amendment, which leaves a trail.

create or replace function public.bookings_prepare() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_event   public.events;
  v_amount  numeric;
  v_deposit numeric;
  v_taken   integer;
  v_staff   boolean := not public.is_end_user() or public.is_coach_or_admin();
begin
  select * into v_event from public.events where id = new.event_id for update;

  if v_event.cancelled_at is not null then
    raise exception 'this event has been cancelled' using errcode = '23514';
  end if;

  if not v_staff then
    if not v_event.registration_open then
      raise exception 'registration for this event is closed' using errcode = '23514';
    end if;
    if coalesce(v_event.end_date, v_event.start_date,
                (select max(d) from unnest(v_event.course_days) d)) < public.club_today() then
      raise exception 'this event has already happened' using errcode = '23514';
    end if;
    if exists (select 1 from public.missing_waivers(new.member_id, new.event_id)) then
      raise exception 'sign the waivers for this event before registering' using errcode = '23514';
    end if;
    if v_event.cancel_policy_id is not null and new.policy_acked_at is null then
      raise exception 'agree to the cancellation policy before registering' using errcode = '23514';
    end if;
    -- The paperwork of a booking is the database's to fill in. A parent
    -- booking for a junior is the one paying for it.
    new.status := 'pending';
    new.created_by := auth.uid();
    new.payer_id := case when new.member_id = auth.uid() then null else auth.uid() end;
    new.refund_requested_at := null;
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.status_before_event_cancel := null;
    new.cancellation_settled_at := null;
    new.cancellation_settled_by := null;
    new.cancellation_settled_note := null;
    if new.policy_acked_at is not null then
      new.policy_acked_at := now();
    end if;
  end if;

  select amount, deposit_amount into v_amount, v_deposit
    from public.prices where id = v_event.price_id;
  new.amount_due := coalesce(v_amount, 0);
  new.deposit    := case when coalesce(v_deposit, 0) > 0 then least(v_deposit, new.amount_due) end;

  if new.status in ('pending', 'confirmed') then
    -- Pending bookings hold their place. The original counted only confirmed
    -- ones here, which lets a popular session take more registrations than it
    -- has room for while deposits are outstanding.
    if v_event.capacity is not null then
      select count(*) into v_taken from public.bookings
        where event_id = new.event_id and status in ('pending', 'confirmed');
      if v_taken >= v_event.capacity then
        new.status := 'waitlisted';
      end if;
    end if;
  end if;

  -- Nothing to pay, nothing to wait for.
  if new.status = 'pending' and new.amount_due = 0 then
    new.status := 'confirmed';
  end if;

  return new;
end;
$$;

create trigger bookings_prepare
  before insert on public.bookings
  for each row execute function public.bookings_prepare();


-- ── what a member may change on their own booking ────────────────────────────
-- Cancel it, while nothing has been paid. Ask for a refund, once something
-- has. Nothing else: not the money, not the status otherwise, not the event.

--
-- Asks `current_user` rather than is_end_user(): the database itself updates
-- bookings on a member's behalf — confirming one when their credit pays the
-- deposit, moving the waitlist when they cancel — from SECURITY DEFINER
-- functions that still carry the member's auth.uid(). Inside those,
-- current_user is the function's owner, and the guard steps aside. Same test
-- the original uses.
create or replace function public.bookings_guard_member_edits() returns trigger
  language plpgsql set search_path to 'public'
  as $$
declare
  v_paid numeric;
begin
  if current_user <> 'authenticated' or public.is_coach_or_admin() then
    return new;
  end if;

  if new.event_id                   is distinct from old.event_id
  or new.member_id                  is distinct from old.member_id
  or new.payer_id                   is distinct from old.payer_id
  or new.amount_due                 is distinct from old.amount_due
  or new.deposit                    is distinct from old.deposit
  or new.policy_acked_at            is distinct from old.policy_acked_at
  or new.status_before_event_cancel is distinct from old.status_before_event_cancel
  or new.cancellation_settled_at    is distinct from old.cancellation_settled_at
  or new.cancellation_settled_by    is distinct from old.cancellation_settled_by
  or new.cancellation_settled_note  is distinct from old.cancellation_settled_note
  or new.created_by                 is distinct from old.created_by then
    raise exception 'that part of a booking is set by the club' using errcode = '42501';
  end if;

  -- Summed here under the member's own RLS (they can read their own
  -- payments) rather than through booking_net_paid, which is not theirs to
  -- call: it would answer about anybody's booking.
  select coalesce(sum(amount), 0) into v_paid
    from public.payments where booking_id = old.id and voided_at is null;

  if new.refund_requested_at is distinct from old.refund_requested_at then
    if old.refund_requested_at is not null then
      raise exception 'a refund request is withdrawn by the club, not by editing it'
        using errcode = '42501';
    end if;
    if v_paid <= 0 then
      raise exception 'nothing has been paid, so there is nothing to refund — cancel instead'
        using errcode = '23514';
    end if;
    new.refund_requested_at := now();
  end if;

  if new.status is distinct from old.status then
    if new.status <> 'cancelled' then
      raise exception 'a member may cancel a booking, not change its status otherwise'
        using errcode = '42501';
    end if;
    -- A paid booking is cancelled by asking for the money back, which an
    -- admin approves. Cancelling it directly would forfeit the payment under
    -- the rules below, which nobody means to do by pressing a button.
    if v_paid > 0 then
      raise exception 'this booking has been paid for — request a refund instead'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger bookings_member_edit_guard
  before update on public.bookings
  for each row execute function public.bookings_guard_member_edits();


-- ── stamping a cancellation ──────────────────────────────────────────────────

create or replace function public.bookings_stamp_cancellation() returns trigger
  language plpgsql set search_path to 'public'
  as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := coalesce(
      (select cancelled_at from public.events where id = new.event_id and new.status_before_event_cancel is not null),
      now());
    new.cancelled_by := auth.uid();
  elsif old.status = 'cancelled' and new.status <> 'cancelled' then
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.cancellation_settled_at := null;
    new.cancellation_settled_by := null;
    new.cancellation_settled_note := null;
    new.refund_requested_at := null;
  end if;
  if new.cancellation_settled_at is not null and old.cancellation_settled_at is null then
    new.cancellation_settled_at := now();
    new.cancellation_settled_by := coalesce(auth.uid(), new.cancellation_settled_by);
  end if;
  return new;
end;
$$;

create trigger bookings_stamp_cancellation
  before update on public.bookings
  for each row execute function public.bookings_stamp_cancellation();


-- ── refunds as credit, on cancellation ───────────────────────────────────────
-- The four cases, as the original has them:
--
--   1. The club cancels the event      → everything paid comes back, deposit
--                                         included, however late.
--   2. The member asked for a refund   → everything paid comes back, minus the
--      on or before the cancel-by date   deposit if the policy keeps it.
--   3. The member asked after it       → only account credit they had spent
--                                         comes back; cash paid stays with the
--                                         club until an admin decides.
--   4. An admin cancels, unasked       → the same as 3.
--
-- Whatever is not returned automatically shows on the booking as `unsettled`
-- until an admin refunds it, credits it, or keeps it as a fee.
--
-- Where the money goes: account credit that was spent comes back to the
-- member who spent it; the rest goes to whoever paid (payer_id), so a parent
-- who paid for a junior gets their own money back.

create or replace function public.bookings_credit_on_cancel() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_event      public.events;
  v_policy_ok  boolean;
  v_net_paid   numeric;
  v_spent      numeric;
  v_keep       numeric := 0;
  v_amount     numeric;
  v_in_time    boolean;
  v_by_event   boolean;
  v_to_member  numeric;
  v_title      text;
  v_source     text;
begin
  -- Once per booking: a second cancellation after a restore does not pay out
  -- twice, because a restore reclaims the first return (below).
  if public.booking_returned(new.id) > 0 then
    return null;
  end if;

  v_net_paid := public.booking_net_paid(new.id);
  if v_net_paid <= 0 then
    return null;
  end if;

  select * into v_event from public.events where id = new.event_id;
  v_title := coalesce(v_event.display_title, v_event.admin_title);
  select coalesce((select deposit_refundable from public.cancellation_policies
                   where id = v_event.cancel_policy_id), true) into v_policy_ok;

  v_spent := coalesce((select sum(amount) from public.payments
                       where booking_id = new.id and method = 'account_credit' and voided_at is null), 0);

  v_by_event := new.status_before_event_cancel is not null;
  v_in_time := v_by_event or (
    new.refund_requested_at is not null
    and (v_event.cancel_date is null
         or (new.refund_requested_at at time zone public.club_timezone())::date <= v_event.cancel_date));

  if not v_by_event and not v_policy_ok then
    v_keep := greatest(least(coalesce(new.deposit, 0), public.booking_owed(new.id), v_net_paid), 0);
  end if;

  v_amount := least(case when v_in_time then v_net_paid else v_spent end, v_net_paid - v_keep);
  if v_amount <= 0 then
    return null;
  end if;

  v_source := case when v_by_event then 'event_cancellation' else 'booking_cancellation_return' end;

  -- Spent credit goes back to the member; the rest to the payer, if another.
  v_to_member := case when new.payer_id is null or new.payer_id = new.member_id
                      then v_amount else least(v_spent, v_amount) end;
  if v_to_member > 0 then
    insert into public.credits (member_id, booking_id, amount, reason, source)
    values (new.member_id, new.id, v_to_member,
            case when v_by_event then 'Refund for cancelled event: ' || v_title
                 else 'Refund for cancelling: ' || v_title end,
            v_source);
  end if;
  if v_amount - v_to_member > 0 then
    insert into public.credits (member_id, booking_id, amount, reason, source)
    values (new.payer_id, new.id, v_amount - v_to_member,
            'Refund for cancelling: ' || v_title || ' (returned to the payer)', v_source);
  end if;

  -- A deposit kept under the policy is the whole of what is left: settled.
  if v_keep > 0 and v_net_paid - v_amount = v_keep then
    update public.bookings
       set cancellation_settled_at = now(),
           cancellation_settled_note = 'Non-refundable deposit kept under the cancellation policy'
     where id = new.id;
  end if;

  return null;
end;
$$;

create trigger bookings_credit_on_cancel
  after update of status on public.bookings
  for each row
  when (old.status <> 'cancelled' and new.status = 'cancelled')
  execute function public.bookings_credit_on_cancel();

-- Restoring a cancelled booking takes its refund back. What is still open is
-- reclaimed; if the member has already spent it, the restore is refused —
-- simpler and more honest than the original's clawback, for a club where the
-- admin can just as easily register them again.
create or replace function public.bookings_reclaim_on_restore() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
begin
  if exists (select 1 from public.credits
             where booking_id = new.id
               and source in ('event_cancellation','booking_cancellation_return')
               and status = 'settled') then
    raise exception 'the refund for this booking has already been spent; register them again instead'
      using errcode = '23514';
  end if;
  update public.credits
     set source = 'return_reclaimed', status = 'settled',
         settled_note = 'Taken back when the booking was restored'
   where booking_id = new.id
     and source in ('event_cancellation','booking_cancellation_return')
     and status = 'open';
  return null;
end;
$$;

create trigger bookings_reclaim_on_restore
  after update of status on public.bookings
  for each row
  when (old.status = 'cancelled' and new.status <> 'cancelled')
  execute function public.bookings_reclaim_on_restore();


-- ── the waitlist moves up ────────────────────────────────────────────────────
-- When a place frees, the longest-waiting booking takes it and is told.
--
-- The original offered the place for 24 hours and waited for an answer, which
-- needs a cron to expire offers. A club registration is cheap to cancel, so the
-- place is simply given: the member is notified and can cancel if they no
-- longer want it.

create or replace function public.promote_waitlist(p_event_id uuid) returns void
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_event public.events;
  v_taken integer;
  v_next  public.bookings;
begin
  select * into v_event from public.events where id = p_event_id for update;
  if v_event.cancelled_at is not null then
    return;
  end if;
  loop
    select count(*) into v_taken from public.bookings
      where event_id = p_event_id and status in ('pending','confirmed');
    exit when v_event.capacity is not null and v_taken >= v_event.capacity;

    select * into v_next from public.bookings
      where event_id = p_event_id and status = 'waitlisted'
      order by created_at limit 1 for update skip locked;
    exit when v_next.id is null;

    update public.bookings set status = 'pending' where id = v_next.id;
    perform public.sync_booking_status(v_next.id);
    insert into public.notifications (member_id, title, body, url, kind)
    values (v_next.member_id, 'A place opened up',
            'You are off the waitlist for ' || coalesce(v_event.display_title, v_event.admin_title) || '.',
            '/calendar/' || p_event_id, 'event');
    v_next := null;
  end loop;
end;
$$;

revoke execute on function public.promote_waitlist(uuid) from public, anon, authenticated;

create or replace function public.bookings_free_a_place() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
begin
  perform public.promote_waitlist(new.event_id);
  return null;
end;
$$;

create trigger bookings_free_a_place
  after update of status on public.bookings
  for each row
  when (old.status in ('pending','confirmed') and new.status not in ('pending','confirmed'))
  execute function public.bookings_free_a_place();

create or replace function public.events_capacity_grew() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
begin
  perform public.promote_waitlist(new.id);
  return null;
end;
$$;

create trigger events_capacity_grew
  after update of capacity on public.events
  for each row
  when (new.capacity is null or (old.capacity is not null and new.capacity > old.capacity))
  execute function public.events_capacity_grew();


-- ── cancelling an event cancels its bookings ─────────────────────────────────
-- Each booking remembers what it was, so restoring the event restores exactly
-- the bookings it cancelled and not ones members had cancelled themselves.

create or replace function public.events_cascade_cancellation() returns trigger
  language plpgsql security definer set search_path to 'public'
  as $$
begin
  if new.cancelled_at is not null and old.cancelled_at is null then
    update public.bookings
       set status_before_event_cancel = status, status = 'cancelled'
     where event_id = new.id and status <> 'cancelled';
  elsif new.cancelled_at is null and old.cancelled_at is not null then
    update public.bookings
       set status = status_before_event_cancel, status_before_event_cancel = null
     where event_id = new.id and status_before_event_cancel is not null;
  end if;
  return null;
end;
$$;

create trigger events_cascade_cancellation
  after update of cancelled_at on public.events
  for each row execute function public.events_cascade_cancellation();


-- ── spending account credit on a booking ─────────────────────────────────────
-- Drains the member's open credit oldest first into a payment on this booking,
-- up to what it still owes. A partly spent row is settled and its remainder
-- re-issued as carry_forward, so every row is spent whole.

create or replace function public.apply_credit_to_booking(p_booking_id uuid, p_amount numeric default null)
  returns numeric
  language plpgsql security definer set search_path to 'public'
  as $$
declare
  v_booking public.bookings;
  v_due     numeric;
  v_avail   numeric;
  v_apply   numeric;
  v_left    numeric;
  v_row     public.credits;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    raise exception 'no such booking';
  end if;
  if not (public.is_self_or_child(v_booking.member_id) or public.is_admin()) then
    raise exception 'not your booking' using errcode = '42501';
  end if;
  if v_booking.status in ('cancelled', 'no_show') then
    raise exception 'this booking is cancelled' using errcode = '23514';
  end if;
  if exists (select 1 from public.events where id = v_booking.event_id and cancelled_at is not null) then
    raise exception 'this event has been cancelled' using errcode = '23514';
  end if;

  v_due := public.booking_owed(p_booking_id) - public.booking_net_paid(p_booking_id);
  select coalesce(sum(amount), 0) into v_avail from public.credits
    where member_id = v_booking.member_id and status = 'open';
  v_apply := least(greatest(v_due, 0), greatest(v_avail, 0), coalesce(p_amount, v_due));
  if v_apply <= 0 then
    return 0;
  end if;

  v_left := v_apply;
  for v_row in
    select * from public.credits
    where member_id = v_booking.member_id and status = 'open' and amount > 0
    order by created_at for update
  loop
    exit when v_left <= 0;
    update public.credits
       set status = 'settled', settled_note = 'Spent on a booking'
     where id = v_row.id;
    if v_row.amount > v_left then
      insert into public.credits (member_id, amount, reason, source)
      values (v_booking.member_id, v_row.amount - v_left,
              'Remainder of: ' || v_row.reason, 'carry_forward');
      v_left := 0;
    else
      v_left := v_left - v_row.amount;
    end if;
  end loop;

  insert into public.payments (member_id, booking_id, amount, method, note, recorded_by)
  values (v_booking.member_id, p_booking_id, v_apply, 'account_credit', 'Applied account credit', auth.uid());

  return v_apply;
end;
$$;

grant execute on function public.apply_credit_to_booking(uuid, numeric) to authenticated;


-- ── the club's email ─────────────────────────────────────────────────────────
-- Contact details are admin-authored rows, edited on the Manage screen. This
-- sets the first of them in the cloud project, which had none.

insert into public.club_contact (id, email)
values (true, 'kuoufencingclub@protonmail.com')
on conflict (id) do update set email = excluded.email;

insert into public.contact_channels (channel, label, url, handle, sort_order)
select 'email', 'Email', 'mailto:kuoufencingclub@protonmail.com', 'kuoufencingclub@protonmail.com', 3
where not exists (select 1 from public.contact_channels where channel = 'email');
