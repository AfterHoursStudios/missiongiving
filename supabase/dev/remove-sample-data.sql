-- Removes the FAKE data created by scripts/seed-sample.mts from a SCRATCH/DEVELOPMENT database.
-- Run as the database owner (SQL editor). It temporarily disables the "no hard delete" triggers that protect financial
-- records, so DO NOT run it on a production database and never edit it to match real donors.
begin;
alter table donations disable trigger trg_don_nodel;
alter table expenses disable trigger trg_exp_nodel;

with d as (select id from donor_profiles where email like 'sample-%@example.test')
delete from receipts where donation_id in (select id from donations where donor_id in (select id from d));
delete from disputes where donation_id in (select id from donations where donor_id in (select id from donor_profiles where email like 'sample-%@example.test'));
delete from refunds  where donation_id in (select id from donations where donor_id in (select id from donor_profiles where email like 'sample-%@example.test'));
delete from dedications where donation_id in (select id from donations where donor_id in (select id from donor_profiles where email like 'sample-%@example.test'));
delete from donations where donor_id in (select id from donor_profiles where email like 'sample-%@example.test');
delete from communication_preferences where donor_id in (select id from donor_profiles where email like 'sample-%@example.test');
delete from donor_profiles where email like 'sample-%@example.test';
delete from expenses where vendor like '[SAMPLE]%';
delete from projects where slug = 'sample-community-health-worker-training';
delete from funds where key = 'project-sample-training';

alter table donations enable trigger trg_don_nodel;
alter table expenses enable trigger trg_exp_nodel;
commit;
