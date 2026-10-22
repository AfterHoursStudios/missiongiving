-- Pledges (recurring gifts) imported from DonorPerfect (scripts/import-donorperfect-pledges.mts). They keep their
-- DonorPerfect pledge ID so the import can be re-run without duplicates, and so the app can tell them apart from
-- Stripe subscriptions: DonorPerfect still processes them, so Mission Giving never charges, changes or cancels them.

alter table recurring_donations add column if not exists dp_pledge_id text;
create unique index if not exists recurring_donations_dp_pledge_id_key on recurring_donations (dp_pledge_id) where dp_pledge_id is not null;
