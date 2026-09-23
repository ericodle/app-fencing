-- ─────────────────────────────────────────────────────────────────────────────
-- Replace the 'popup' event kind with 'cross_training'.
--
-- A cross-training session is conditioning away from the strip — a run, hill
-- sprints, strength work in a park. It takes over the pop-up's place as the one
-- kind whose venue the club negotiates, so the meetup planner and the coach's
-- move-the-session permission carry straight over. Unlike a pop-up it has no
-- bouting; src/lib/event-kinds.ts answers the rest.
--
-- Existing rows are renamed rather than dropped: an event that was a pop-up
-- keeps its poll, its answers and its meetup suggestion.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.events   drop constraint events_kind_check;
alter table public.prices   drop constraint prices_applies_to_check;
alter table public.waivers  drop constraint waivers_applies_to_check;

update public.events  set kind = 'cross_training' where kind = 'popup';
update public.prices  set applies_to = array_replace(applies_to, 'popup', 'cross_training')
  where 'popup' = any (applies_to);
update public.waivers set applies_to = array_replace(applies_to, 'popup', 'cross_training')
  where 'popup' = any (applies_to);

alter table public.events add constraint events_kind_check
  check (kind = any (array['practice','course','cross_training','tournament','interclub','social']));
alter table public.prices add constraint prices_applies_to_check
  check (applies_to <@ array['practice','course','cross_training','tournament','interclub','social']);
alter table public.waivers add constraint waivers_applies_to_check
  check (applies_to <@ array['practice','course','cross_training','tournament','interclub','social']);
