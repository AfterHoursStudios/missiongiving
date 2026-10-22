-- Gifts imported from DonorPerfect (scripts/import-donorperfect-gifts.mts) keep their DonorPerfect Gift ID, so the
-- import can be re-run without creating duplicates. Null for gifts made in Mission Giving.

alter table donations add column if not exists dp_gift_id text;
create unique index if not exists donations_dp_gift_id_key on donations (dp_gift_id) where dp_gift_id is not null;
