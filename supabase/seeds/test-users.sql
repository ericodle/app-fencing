-- Local-only test users. Runs on every `make reset` (configured in
-- supabase/config.toml's [db.seed] sql_paths). NEVER pushed to the cloud —
-- `make push` only ships migrations from supabase/migrations/.
--
-- Credentials match the DEV_ACCOUNTS list in src/pages/LoginPage.tsx so the
-- dev one-click login buttons work after every reset:
--
--   fencer@fencer.fencer / fencerfencer
--   coach@coach.coach    / coachcoach
--   admin@admin.admin    / adminadmin
--
-- Deterministic UUIDs + ON CONFLICT DO NOTHING make this safe to rerun.
-- email_confirmed_at is set so login skips the confirm gate.
--
-- Profile rows are created by the handle_new_user trigger on auth.users
-- insert; role, status and the athlete fields are patched afterwards.

do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'fencer@fencer.fencer', 'fencerfencer'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'admin@admin.admin',    'adminadmin'),
      ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'coach@coach.coach',    'coachcoach'),
      ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'lefty@fencer.fencer',  'fencerfencer'),
      ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, 'junior@fencer.fencer', 'fencerfencer'),
      ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 'pending@fencer.fencer','fencerfencer')
    ) v(id, email, password)
  loop
    -- GoTrue scans these token columns into non-nullable Go strings, so NULL
    -- there causes "Database error querying schema" on sign-in. Postgres
    -- leaves them NULL by default; set them to '' explicitly.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_anonymous,
      confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', rec.id,
      'authenticated', 'authenticated', rec.email,
      extensions.crypt(rec.password, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), false,
      '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (
      provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at, id
    ) values (
      rec.id::text, rec.id,
      jsonb_build_object('sub', rec.id::text, 'email', rec.email, 'email_verified', true),
      'email', now(), now(), now(), gen_random_uuid()
    ) on conflict (provider, provider_id) do nothing;
  end loop;
end $$;

-- Roles, status and an athlete profile each account can be recognized by.
-- Home pins are real Taipei districts, spread across the city so the meetup
-- planner has something to chew on the moment the stack comes up.
update public.profiles set
  role = 'fencer', status = 'active', name = 'Mei Lin', nickname = 'Mei',
  date_of_birth = '1996-04-12', handedness = 'right',
  height_cm = 168, weight_kg = 60, arm_span_cm = 171,
  weapons = array['epee','saber'], primary_weapon = 'epee', grip = 'pistol',
  started_fencing_on = '2019-12-02',
  rating_epee = 'C', rating_epee_year = 2025,
  home_label = 'Daan', home_lat = 25.0263, home_lng = 121.5436,
  travel_mode = 'transit', seats_offered = 0,
  emergency_contact_name = 'Lin Wei', emergency_contact_phone = '0912345678',
  contact_method = 'line', contact_id = 'meilin',
  equipment_owned = array['Mask','Jacket','Glove','Épée','Body cord'],
  agreed_to_terms_at = now(), agreed_to_terms_version = 1
where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

update public.profiles set
  role = 'admin', status = 'active', name = 'Club Admin',
  handedness = 'right', weapons = array['epee'], primary_weapon = 'epee',
  home_label = 'Zhongshan', home_lat = 25.0640, home_lng = 121.5260,
  travel_mode = 'drive', seats_offered = 4,
  agreed_to_terms_at = now(), agreed_to_terms_version = 1
where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

update public.profiles set
  role = 'coach', status = 'active', name = 'Coach Wu', nickname = 'Wu',
  date_of_birth = '1981-08-30', handedness = 'left',
  height_cm = 180, arm_span_cm = 186,
  weapons = array['epee','foil','saber'], primary_weapon = 'saber', grip = 'french',
  started_fencing_on = '1996-09-01',
  rating_saber = 'A', rating_saber_year = 2022,
  rating_epee = 'B', rating_epee_year = 2019,
  referee_qualification = 'National, saber',
  home_label = 'Shilin', home_lat = 25.0880, home_lng = 121.5250,
  travel_mode = 'drive', seats_offered = 3,
  agreed_to_terms_at = now(), agreed_to_terms_version = 1
where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- A left-hander, because the handedness split on the stats page is only
-- interesting once there is somebody on the other side of it.
update public.profiles set
  role = 'fencer', status = 'active', name = 'Sam Reyes', nickname = 'Sam',
  date_of_birth = '2001-01-19', handedness = 'left',
  height_cm = 175, arm_span_cm = 182,
  weapons = array['epee'], primary_weapon = 'epee', grip = 'pistol',
  started_fencing_on = '2022-03-15',
  rating_epee = 'E', rating_epee_year = 2024,
  home_label = 'Banqiao', home_lat = 25.0143, home_lng = 121.4672,
  travel_mode = 'transit',
  agreed_to_terms_at = now(), agreed_to_terms_version = 1
where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

-- A junior on a parent account, to exercise the family policies.
update public.profiles set
  role = 'fencer', status = 'active', name = 'Kai Lin', nickname = 'Kai',
  date_of_birth = '2013-06-06', handedness = 'right',
  height_cm = 148, weapons = array['epee'], primary_weapon = 'epee',
  started_fencing_on = '2025-01-10',
  home_label = 'Daan', home_lat = 25.0263, home_lng = 121.5436,
  travel_mode = 'transit',
  parent_account = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  agreed_to_terms_at = now(), agreed_to_terms_version = 1
where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

-- Left pending on purpose, so the admin approval queue is never empty in dev.
update public.profiles set
  role = 'fencer', status = 'pending', name = 'Jordan Tan',
  emergency_contact_name = 'Tan Ling', emergency_contact_phone = '0987654321',
  home_label = 'Nangang', home_lat = 25.0538, home_lng = 121.6066
where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
