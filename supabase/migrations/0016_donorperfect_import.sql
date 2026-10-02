-- DonorPerfect import (scripts/import-donorperfect.mts): each imported donor keeps their DonorPerfect ID, score and
-- giving totals from before Mission Giving. These are history only: reports, statements and project totals count
-- donations made in this system, never these figures. Donors cannot edit them (not in the column grant from 0002).

alter table donor_profiles
  add column if not exists dp_id text unique,
  add column if not exists dp_score int,
  add column if not exists dp_total_given_cents bigint,
  add column if not exists dp_gift_count int,
  add column if not exists dp_last_gift_at date,
  add column if not exists dp_last_gift_cents bigint,
  add column if not exists dp_imported_at timestamptz;

-- Donor list: expose the DonorPerfect history alongside this system's totals (new columns appended at the end).
create or replace view donor_summary as
select
  d.id, d.user_id, d.first_name, d.last_name, d.email, d.phone, d.status, d.organization_name, d.created_at,
  coalesce(s.lifetime_cents, 0)::bigint as lifetime_cents,
  s.first_gift_at, s.last_gift_at,
  coalesce(s.gift_count, 0)::int as gift_count,
  coalesce(r.active_recurring, 0)::int as active_recurring,
  d.dp_id, d.dp_score, d.dp_total_given_cents, d.dp_gift_count, d.dp_last_gift_at
from donor_profiles d
left join (
  select donor_id,
    sum(amount_cents - refunded_cents) filter (where status in ('succeeded','partially_refunded','refunded')) as lifetime_cents,
    min(coalesce(settled_at, donated_at)) filter (where status in ('succeeded','partially_refunded','refunded')) as first_gift_at,
    max(coalesce(settled_at, donated_at)) filter (where status in ('succeeded','partially_refunded','refunded')) as last_gift_at,
    count(*) filter (where status in ('succeeded','partially_refunded','refunded')) as gift_count
  from donations group by donor_id
) s on s.donor_id = d.id
left join (
  select donor_id, count(*) as active_recurring from recurring_donations where status in ('active','past_due') group by donor_id
) r on r.donor_id = d.id
where d.deleted_at is null and d.merged_into is null;
revoke all on donor_summary from anon, authenticated;
