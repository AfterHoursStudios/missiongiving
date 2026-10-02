-- DEVELOPMENT ONLY: delete EVERY donor and everything tied to them, to start from scratch before launch.
-- Run once as the database owner in the Supabase SQL editor. It briefly disables the "no hard delete" triggers that
-- protect financial records, so NEVER run it on a database with real donors. As a guard it refuses to run when there
-- are more than 25 donor records (raise the number below only if you are certain every record is test data).
--
-- Removed: donor records, donations, receipts, refunds, disputes, dedications, recurring gifts, saved payment-method
-- metadata, notes, tags on donors, communication preferences, campaign recipients, data requests, annual statements,
-- the communications log and to-dos (0013/0014, if applied), and sign-in accounts that belong ONLY to donors.
-- Kept: staff accounts (any login with a staff profile or role), projects, sponsorship profiles, tiers, forms, campaigns,
-- message templates, expenses, settings and the audit log. Stripe test-mode customers are not touched.

begin;

do $$
declare n int;
begin
  select count(*) into n from donor_profiles;
  if n > 25 then raise exception 'Refusing to run: % donor records found (limit 25). This does not look like test data.', n; end if;
end $$;

-- Sign-in accounts to remove afterwards: donor logins that are not staff.
create temp table donor_only_users on commit drop as
select d.user_id as id from donor_profiles d
where d.user_id is not null
  and d.user_id not in (select user_id from staff_profiles)
  and d.user_id not in (select user_id from staff_role_assignments);

alter table donations disable trigger trg_don_nodel;
alter table recurring_donations disable trigger trg_rec_nodel;

do $$
begin
  if to_regclass('public.donor_communications') is not null then delete from donor_communications; end if;
  if to_regclass('public.donor_todos') is not null then delete from donor_todos; end if;
end $$;

delete from receipts;
delete from refunds;
delete from disputes;
delete from dedications;
delete from donations;
delete from recurring_donations;
delete from payment_methods_metadata;
delete from campaign_recipients;          -- email_events cascade
delete from annual_statements;
delete from data_requests;
delete from donor_notes;
delete from donor_tag_assignments;
delete from communication_preferences;
update donor_profiles set merged_into = null;
delete from donor_profiles;

alter table donations enable trigger trg_don_nodel;
alter table recurring_donations enable trigger trg_rec_nodel;

-- OPTIONAL: also zero the manual "offline adjustment" amounts staff added to project totals (e.g. a test $2,000 on
-- "Every Girl Fundraising"). Remove the two dashes at the start of the next line only if those amounts are test data.
-- update projects set offline_adjustment_cents = 0 where offline_adjustment_cents <> 0;

-- Reset the receipt numbers so the first real receipt is MG-00001000.
alter sequence receipt_number_seq restart with 1000;

delete from auth.users where id in (select id from donor_only_users);   -- profiles cascade

commit;

select (select count(*) from donor_profiles) as donors_left, (select count(*) from donations) as donations_left,
       (select count(*) from recurring_donations) as recurring_left, (select count(*) from staff_profiles) as staff_kept;
