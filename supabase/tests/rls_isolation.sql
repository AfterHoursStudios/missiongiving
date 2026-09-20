-- Donor data isolation check. NOT YET RUN: execute in the Supabase SQL editor (or `psql`) against a scratch project
-- after applying migrations 0001-0004. Everything runs in a transaction and is rolled back.
-- Expected: the script completes with NOTICE lines "PASS ..."; any failure raises an exception.
begin;

insert into auth.users (id, email, instance_id, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'donor-a@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'donor-b@example.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into donor_profiles (id, user_id, email, normalized_email, first_name, last_name) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'donor-a@example.test', 'donor-a@example.test', 'Sample', 'A'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2', 'donor-b@example.test', 'donor-b@example.test', 'Sample', 'B');

insert into donations (id, donor_id, amount_cents, frequency, payment_method, status) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 1000, 'one_time', 'card', 'succeeded'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', 2000, 'one_time', 'card', 'succeeded');

-- Act as donor A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from donations;
  if n <> 1 then raise exception 'FAIL: donor A sees % donations (expected 1)', n; end if;
  select count(*) into n from donations where donor_id = '10000000-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'FAIL: donor A can read donor B donation'; end if;
  select count(*) into n from donor_profiles;
  if n <> 1 then raise exception 'FAIL: donor A sees % donor profiles', n; end if;
  raise notice 'PASS: read isolation';

  -- A cannot modify B's profile (0 rows updated) or protected columns of their own.
  update donor_profiles set first_name = 'Hacked' where id = '10000000-0000-0000-0000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: donor A updated donor B'; end if;
  begin
    update donor_profiles set stripe_customer_id = 'cus_evil' where id = '10000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL: donor could update protected column';
  exception when insufficient_privilege then raise notice 'PASS: protected columns'; end;

  -- Donors cannot write donations or read the audit log / settings.
  begin
    insert into donations (donor_id, amount_cents, frequency, payment_method, status)
      values ('10000000-0000-0000-0000-00000000000a', 1, 'one_time', 'card', 'succeeded');
    raise exception 'FAIL: donor inserted a donation';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'PASS: donations are server-write only';
  end;
  select count(*) into n from audit_logs;
  if n <> 0 then raise exception 'FAIL: donor can read audit logs'; end if;
  select count(*) into n from organization_settings;
  if n <> 0 then raise exception 'FAIL: donor can read organization_settings'; end if;
  raise notice 'PASS: staff-only tables hidden';
end $$;

rollback;
