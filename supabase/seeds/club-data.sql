-- Local-only club fixtures: venues, a term's worth of sessions, an open
-- attendance poll with answers, bouts, a competition and some benchmarks.
--
-- Enough for every page to have something on it the moment `npm run db:start`
-- finishes, and specifically enough for the meetup planner to produce a real
-- answer — five people spread across Taipei, which is the case the feature
-- exists for. NEVER pushed to the cloud.

-- ── the club's own text ──────────────────────────────────────────────────────
insert into public.club_profile (id, mission, about)
values (true,
  'Physical training, mental training, data-driven. Épée and saber in Taipei, taught in English and Chinese.',
  'Kuou Fencing Club opened in December 2019. Coach Ku takes saber and Coach Eric takes épée. Guests from other clubs are welcome at open training.')
on conflict (id) do nothing;

insert into public.club_contact (id, email, phone, address, native_address, map_query, hours)
values (true, 'hello@kuou.tw', '+886 2 2762 1234',
  'No. 128, Section 4, Bade Road, Songshan District, Taipei',
  '台北市松山區八德路四段128號',
  'No. 128, Section 4, Bade Road, Taipei',
  'Mon–Fri evenings, Saturday mornings')
on conflict (id) do nothing;

insert into public.contact_channels (channel, label, url, handle, sort_order) values
  ('line',      'LINE',      'https://line.me/R/ti/p/@kuoufencing',      '@kuoufencing',       1),
  ('instagram', 'Instagram', 'https://instagram.com/kuoufencing',        '@kuoufencing',       2),
  ('email',     'Email',     'mailto:hello@sheshouzuo.tw',               'hello@kuou.tw',3)
on conflict do nothing;

insert into public.terms (version, body, published_at)
values (1,
  E'# Terms of use\n\nBy training with Kuou Fencing Club you agree to follow the coach''s instructions on the floor, to fence only in full kit, and to report any damaged equipment before using it.\n\nFencing is a combat sport. Bruises are normal; anything more is not, and must be reported.',
  now())
on conflict (version) do nothing;

insert into public.waivers (code, version, title, body, applies_to, requires_guardian, published_at) values
  ('liability', 1, 'Assumption of risk and release of liability',
   E'Fencing is a combat sport conducted with a weapon. I understand that injury is possible even when every rule is followed, and I accept that risk.\n\nI confirm that I will fence only in equipment that meets the standard for my weapon, and that I will stop immediately when the referee or coach calls halt.',
   array['practice','course','popup','tournament','interclub'], false, now()),
  ('media', 1, 'Media release',
   E'I agree that photographs and video taken at club sessions and competitions may be used by the club to show what it does.\n\nI may withdraw this at any time by telling a coach, and any image of me will be removed from anything the club controls.',
   array['practice','course','popup','tournament','interclub','social'], false, now()),
  ('safeguarding', 1, 'Consent for a fencer under 18',
   E'I am the parent or legal guardian of the fencer named below. I consent to their taking part in club sessions and competitions, and to first aid being given if it is needed and I cannot be reached.',
   array['practice','course','popup','tournament','interclub','social'], true, now())
on conflict (code, version) do nothing;


-- ── venues ───────────────────────────────────────────────────────────────────
-- Real places, spread across the city, so the meetup ranking has genuine
-- alternatives rather than three pins in the same block.
insert into public.venues (id, name, native_name, kind, address, district, lat, lng, map_query, pistes, capacity, indoor, has_scoring, notes) values
  ('11111111-0000-4000-8000-000000000001', 'Bade Road salle', '八德路場地', 'salle',
   'No. 128, Section 4, Bade Road, Songshan District, Taipei', 'Songshan',
   25.0478, 121.5638, 'No. 128, Section 4, Bade Road, Taipei', 4, 24, true, true,
   'The club''s home floor. B1, four grounded strips, reels on all of them.'),
  ('11111111-0000-4000-8000-000000000002', 'Minsheng Park', '民生公園', 'park',
   'Minsheng Park, Songshan District, Taipei', 'Songshan',
   25.0619, 121.5560, 'Minsheng Park, Taipei', null, 30, false, false,
   'Footwork only — no blades. Moves under the covered walkway if it rains.'),
  ('11111111-0000-4000-8000-000000000003', 'Daan Sports Center', '大安運動中心', 'gym',
   'No. 2, Section 4, Xinyi Road, Daan District, Taipei', 'Daan',
   25.0330, 121.5436, 'Daan Sports Center, Taipei', 2, 16, true, false,
   'Booked by the hour. Bring the scoring box and two reels.'),
  ('11111111-0000-4000-8000-000000000004', 'Banqiao Gymnasium', '板橋體育館', 'gym',
   'No. 1, Section 1, Xianmin Boulevard, Banqiao District, New Taipei', 'Banqiao',
   25.0143, 121.4672, 'Banqiao Gymnasium, New Taipei', 6, 40, true, true,
   'Where the city championships are held. Worth the trip when the west side turns out.'),
  ('11111111-0000-4000-8000-000000000005', 'Nangang Community Hall', '南港社區活動中心', 'community',
   'Nangang District, Taipei', 'Nangang',
   25.0538, 121.6066, 'Nangang District Office, Taipei', 2, 14, true, false,
   'Small, cheap, and the only indoor floor east of Songshan.'),
  ('11111111-0000-4000-8000-000000000006', 'Shilin Community Center', '士林活動中心', 'community',
   'Shilin District, Taipei', 'Shilin',
   25.0880, 121.5250, 'Shilin District Office, Taipei', 2, 16, true, false,
   'North-side option. Sprung floor, no power.')
on conflict (id) do nothing;

insert into public.prices (label, amount, currency, unit, applies_to, sort_order) values
  ('Drop-in, open training',   400, 'NTD', 'session', array['practice','popup'], 1),
  ('Adult beginner term',     6000, 'NTD', 'term',    array['course'],           2),
  ('Kids'' term',             5000, 'NTD', 'term',    array['course'],           3),
  ('Ten-session card',        3500, 'NTD', 'pass',    array['practice'],         4),
  ('Annual membership',       1500, 'NTD', 'membership', '{}',                   5),
  ('Full loaner kit',          400, 'NTD', 'loan',    '{}',                      6)
on conflict do nothing;

insert into public.discounts (label, kind, value, eligibility) values
  ('Student',  'percent', 20, 'Full-time student with a valid card'),
  ('Sibling',  'percent', 15, 'Second and subsequent child from one family'),
  ('Coach',    'percent', 100, 'Club coaching staff')
on conflict do nothing;


-- ── the season ───────────────────────────────────────────────────────────────
-- Dates are relative to now() so the calendar is never empty, whenever the
-- stack is reset.
insert into public.events (
  id, kind, admin_title, display_title, calendar_title, venue_id,
  start_date, start_time, end_time, weapons, level, capacity, price, currency,
  polls_attendance, meetup_open, notes, created_by
) values
  ('22222222-0000-4000-8000-000000000001', 'practice',
   'Open training — Tuesday', 'Open training', 'Open training',
   '11111111-0000-4000-8000-000000000001',
   (current_date + 1), '19:00', '21:30', array['epee','saber'], 'open', 24, 400, 'NTD',
   true, false,
   'Épée and saber bouting with a coach on the floor. Guests from other clubs welcome.',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),

  ('22222222-0000-4000-8000-000000000002', 'popup',
   'Park footwork — Saturday', 'Park footwork', 'Park footwork',
   '11111111-0000-4000-8000-000000000002',
   (current_date + 4), '06:45', '07:45', '{}', 'all', 30, null, null,
   true, true,
   'No blades needed: footwork drills in running shoes. Where we meet depends on who is coming — check the planner on Friday night.',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),

  ('22222222-0000-4000-8000-000000000003', 'practice',
   'Saber night', 'Saber night', 'Saber night',
   '11111111-0000-4000-8000-000000000001',
   (current_date + 3), '19:00', '21:00', array['saber'], 'intermediate', 16, 400, 'NTD',
   true, false, 'Saber only. Lamés and conductive gloves required — the rack has four of each.',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),

  ('22222222-0000-4000-8000-000000000004', 'interclub',
   'Interclub vs Neihu Fencing', 'Interclub vs Neihu', 'Interclub',
   '11111111-0000-4000-8000-000000000004',
   (current_date + 11), '13:00', '18:00', array['epee'], 'open', 20, null, null,
   true, false, 'Team épée, three on three, at Banqiao. Travel by carpool — offer a seat when you RSVP.',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),

  ('22222222-0000-4000-8000-000000000005', 'social',
   'End-of-term dinner', 'End-of-term dinner', 'Dinner',
   null,
   (current_date + 25), '19:00', null, '{}', 'all', null, null, null,
   true, false, 'Somewhere with round tables. Bring nobody sharp.',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),

  ('22222222-0000-4000-8000-000000000006', 'practice',
   'Open training — last Tuesday', 'Open training', 'Open training',
   '11111111-0000-4000-8000-000000000001',
   (current_date - 6), '19:00', '21:30', array['epee','saber'], 'open', 24, 400, 'NTD',
   false, false, null, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (id) do nothing;

-- The adult beginner term, on an explicit day list.
insert into public.events (
  id, kind, admin_title, display_title, calendar_title, venue_id,
  course_days, start_time, end_time, weapons, level, capacity, price, currency,
  polls_attendance, notes, created_by
) values (
  '22222222-0000-4000-8000-000000000007', 'course',
  'Adult beginner épée — autumn term', 'Adult beginner lessons · Épée', 'Beginner épée',
  '11111111-0000-4000-8000-000000000001',
  array[(current_date + 2), (current_date + 9), (current_date + 16), (current_date + 23)]::date[],
  '19:00', '21:00', array['epee'], 'beginner', 10, 6000, 'NTD',
  false, 'Four evenings. You finish competition-ready, and the kit is included.',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
) on conflict (id) do nothing;

-- The rota, split by weapon: Coach Ku on saber, Coach Eric on épée. Open
-- training runs both, so both are on it — which is also what makes the duties
-- table worth having rather than a single coach column on the event.
insert into public.duties (event_id, assignee_id, role) values
  -- Open training (épée + saber)
  ('22222222-0000-4000-8000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'coach'),
  ('22222222-0000-4000-8000-000000000001', 'cccccccc-1111-4111-8111-cccccccccccc', 'coach'),
  -- Saber night
  ('22222222-0000-4000-8000-000000000003', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'coach'),
  -- Interclub, team épée
  ('22222222-0000-4000-8000-000000000004', 'cccccccc-1111-4111-8111-cccccccccccc', 'coach'),
  -- Adult beginner épée
  ('22222222-0000-4000-8000-000000000007', 'cccccccc-1111-4111-8111-cccccccccccc', 'coach')
on conflict do nothing;


-- ── an open poll, with answers ───────────────────────────────────────────────
-- The Saturday pop-up: five people from five districts, which is exactly the
-- shape the meetup planner is for.
insert into public.attendance_polls (id, event_id, question, closes_at, created_by)
values ('33333333-0000-4000-8000-000000000001',
        '22222222-0000-4000-8000-000000000002',
        'Coming to park footwork on Saturday? Say yes by Friday night and the planner will pick where.',
        (current_date + 3 + time '21:00') at time zone 'Asia/Taipei',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (event_id) do nothing;

insert into public.attendance_responses
  (poll_id, member_id, response, arriving_at, travel_mode, seats_offered, needs_ride, note) values
  ('33333333-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'yes',   '06:45', 'transit', 0, false, null),
  ('33333333-0000-4000-8000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'yes',   '06:30', 'drive',   3, false, 'Bringing the cones.'),
  ('33333333-0000-4000-8000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'yes',   '07:00', 'transit', 0, true,  'Can only make the second half.'),
  ('33333333-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'yes',   '06:45', 'drive',   4, false, null),
  ('33333333-0000-4000-8000-000000000001', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'maybe', null,    'transit', 0, true,  'Depends on a school thing.')
on conflict (poll_id, member_id) do nothing;

-- Tuesday's poll, so the calendar badge has a second number on it.
insert into public.attendance_polls (id, event_id, closes_at, created_by)
values ('33333333-0000-4000-8000-000000000002',
        '22222222-0000-4000-8000-000000000001',
        (current_date + 1 + time '17:00') at time zone 'Asia/Taipei',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
on conflict (event_id) do nothing;

insert into public.attendance_responses (poll_id, member_id, response, travel_mode) values
  ('33333333-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'yes', 'transit'),
  ('33333333-0000-4000-8000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'yes', 'transit'),
  ('33333333-0000-4000-8000-000000000002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'no',  'transit')
on conflict (poll_id, member_id) do nothing;


-- ── bouts ────────────────────────────────────────────────────────────────────
-- A term of Tuesday nights. Enough of them, against both a left-hander and
-- right-handers, for the handedness split on the stats page to say something.
insert into public.bouts
  (bouted_on, event_id, weapon, bout_type, touches_to, bout_number,
   fencer_id, score_for, score_against, opponent_id, recorded_by)
select
  (current_date - (7 * g.week))::date,
  '22222222-0000-4000-8000-000000000006',
  'epee', 'practice', 5, g.n,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  g.sf, g.sa,
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
from (values
  (1, 1, 5, 3), (1, 2, 4, 5), (1, 3, 5, 4),
  (2, 1, 3, 5), (2, 2, 5, 2), (2, 3, 2, 5),
  (3, 1, 5, 1), (3, 2, 4, 4), (3, 3, 5, 3)
) as g(week, n, sf, sa)
on conflict do nothing;

-- Against outside opponents, where the handedness is recorded inline.
insert into public.bouts
  (bouted_on, weapon, bout_type, touches_to, fencer_id, score_for, score_against,
   opponent_name, opponent_club, opponent_handedness, opponent_rating, recorded_by, notes)
values
  ((current_date - 30), 'epee', 'pool', 5, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 2,
   'Ana Lopez', 'Neihu Fencing', 'right', 'D', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null),
  ((current_date - 30), 'epee', 'pool', 5, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, 5,
   'Hana Sato', 'Tianmu Club', 'left', 'C', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Kept falling for the second-intention counter. Watch the distance on her preparation.'),
  ((current_date - 30), 'epee', 'de', 15, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 12, 15,
   'Hana Sato', 'Tianmu Club', 'left', 'C', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'Led 10-6 and stopped attacking.'),
  ((current_date - 60), 'epee', 'pool', 5, 'dddddddd-dddd-dddd-dddd-dddddddddddd', 5, 4,
   'Ana Lopez', 'Neihu Fencing', 'right', 'D', 'dddddddd-dddd-dddd-dddd-dddddddddddd', null)
on conflict do nothing;


-- ── a competition ────────────────────────────────────────────────────────────
insert into public.competitions (id, name, start_date, location, country, organizer, level)
values ('44444444-0000-4000-8000-000000000001', 'Taipei City Open',
        (current_date - 30), 'Banqiao Gymnasium, New Taipei', 'Taiwan',
        'Chinese Taipei Fencing Association', 'regional')
on conflict (id) do nothing;

insert into public.competition_results
  (competition_id, fencer_id, weapon, category, place, entrants, seed_before,
   pool_victories, pool_bouts, pool_touches_for, pool_touches_against,
   seed_after_pools, de_rounds_won, de_exit_round, rating_earned, notes)
values
  ('44444444-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'epee', 'senior', 9, 64, 22, 4, 5, 23, 16, 14, 2, 'Table of 16', null,
   'Lost the 16 after leading. Pool was the best of the season.'),
  ('44444444-0000-4000-8000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
   'epee', 'senior', 33, 64, 55, 2, 5, 18, 22, 38, 0, 'Table of 64', null, null)
on conflict do nothing;


-- ── benchmarks ───────────────────────────────────────────────────────────────
-- Three points on each curve, so the trend arrows and the personal bests have
-- something to be computed from rather than rendering as dashes.
insert into public.fitness_tests (fencer_id, tested_on, metric, value, unit, recorded_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date - 180), 'run_5k',        1685, 's',  'cccccccc-1111-4111-8111-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date -  90), 'run_5k',        1602, 's',  'cccccccc-1111-4111-8111-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date -  14), 'run_5k',        1548, 's',  'cccccccc-1111-4111-8111-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date - 180), 'sprint_100m',   15.8, 's',  'cccccccc-1111-4111-8111-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date -  14), 'sprint_100m',   15.1, 's',  'cccccccc-1111-4111-8111-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date - 180), 'lunge_length',   132, 'cm', 'cccccccc-1111-4111-8111-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date -  90), 'lunge_length',   139, 'cm', 'cccccccc-1111-4111-8111-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date -  14), 'lunge_length',   144, 'cm', 'cccccccc-1111-4111-8111-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date -  14), 'vertical_jump',   41, 'cm', 'cccccccc-1111-4111-8111-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date -  14), 'advance_retreat_10m', 9.8, 's', 'cccccccc-1111-4111-8111-cccccccccccc'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', (current_date -  14), 'run_5k',        1425, 's',  'cccccccc-1111-4111-8111-cccccccccccc'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', (current_date -  14), 'lunge_length',   151, 'cm', 'cccccccc-1111-4111-8111-cccccccccccc'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', (current_date -  14), 'grip_strength',   46, 'kg', 'cccccccc-1111-4111-8111-cccccccccccc')
on conflict do nothing;

-- The sided test, both sides, so the asymmetry has something to show.
insert into public.fitness_tests (fencer_id, tested_on, metric, value, unit, side, recorded_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date - 14), 'single_leg_hop', 412, 'cm', 'right', 'cccccccc-1111-4111-8111-cccccccccccc'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', (current_date - 14), 'single_leg_hop', 361, 'cm', 'left',  'cccccccc-1111-4111-8111-cccccccccccc')
on conflict do nothing;
