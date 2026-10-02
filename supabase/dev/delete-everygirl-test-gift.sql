-- One-off cleanup (2026-10-01): delete Broc Ramlo's $450.00 one-time TEST gift to "Every Girl Fundraising" and set the
-- project's "raised elsewhere" amount back to the DonorPerfect total from campaigns.csv ($4,540.67), so the project
-- total matches the CSV exactly. Run once as the database owner in the Supabase SQL editor. All-or-nothing.

begin;

-- Guard: only proceed if this is still the exact gift we expect.
do $$
begin
  if not exists (
    select 1 from donations
    where id = 'e2cb39d4-6cd5-4ba1-8d62-8efac9d0d115' and amount_cents = 45000 and frequency = 'one_time'
      and stripe_payment_intent_id = 'pi_3ULrk0FAPH2mNi221o4NKkr5'
  ) then raise exception 'Gift not found or changed; nothing deleted.'; end if;
end $$;

alter table donations disable trigger trg_don_nodel;

do $$
begin
  if to_regclass('public.donor_communications') is not null then
    delete from donor_communications where donation_id = 'e2cb39d4-6cd5-4ba1-8d62-8efac9d0d115';
  end if;
end $$;
delete from receipts    where donation_id = 'e2cb39d4-6cd5-4ba1-8d62-8efac9d0d115';
delete from refunds     where donation_id = 'e2cb39d4-6cd5-4ba1-8d62-8efac9d0d115';
delete from disputes    where donation_id = 'e2cb39d4-6cd5-4ba1-8d62-8efac9d0d115';
delete from dedications where donation_id = 'e2cb39d4-6cd5-4ba1-8d62-8efac9d0d115';
delete from donations   where id = 'e2cb39d4-6cd5-4ba1-8d62-8efac9d0d115';

alter table donations enable trigger trg_don_nodel;

update projects
set offline_adjustment_cents = 454067,
    offline_adjustment_note = concat_ws(E'\n', offline_adjustment_note,
      '2026-10-01: set to $4540.67 (DonorPerfect total from campaigns.csv) after deleting the $450.00 test gift')
where title = 'Every Girl Fundraising' and kind <> 'sponsorship';

insert into audit_logs (actor_id, action, entity_type, entity_id, details)
values (null, 'financial.adjustment', 'donation', 'e2cb39d4-6cd5-4ba1-8d62-8efac9d0d115',
        '{"op": "test_gift_deleted", "amount_cents": 45000, "project": "Every Girl Fundraising"}');

commit;

select title, offline_adjustment_cents / 100.0 as raised_elsewhere,
       (select count(*) from donations d where d.project_id = p.id) as gifts_on_site
from projects p where title = 'Every Girl Fundraising';
