-- Donor list (DonorPerfect-style): one set of figures per donor that combines their DonorPerfect history (0016)
-- with gifts made in this system. List display and sorting only; reports and statements still count only gifts
-- made here. New columns are appended so the existing view columns keep their positions.

create or replace view donor_summary as
select
  d.id, d.user_id, d.first_name, d.last_name, d.email, d.phone, d.status, d.organization_name, d.created_at,
  coalesce(s.lifetime_cents, 0)::bigint as lifetime_cents,
  s.first_gift_at, s.last_gift_at,
  coalesce(s.gift_count, 0)::int as gift_count,
  coalesce(r.active_recurring, 0)::int as active_recurring,
  d.dp_id, d.dp_score, d.dp_total_given_cents, d.dp_gift_count, d.dp_last_gift_at,
  (coalesce(s.lifetime_cents, 0) + coalesce(d.dp_total_given_cents, 0))::bigint as total_given_cents,
  (coalesce(s.gift_count, 0) + coalesce(d.dp_gift_count, 0))::int as total_gifts,
  greatest(s.last_gift_at, d.dp_last_gift_at::timestamptz) as latest_gift_at,
  case when s.last_gift_at is not null and (d.dp_last_gift_at is null or s.last_gift_at >= d.dp_last_gift_at::timestamptz)
       then lg.amount_cents else d.dp_last_gift_cents end as latest_gift_cents
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
left join lateral (
  select amount_cents from donations
  where donor_id = d.id and status in ('succeeded','partially_refunded','refunded')
  order by coalesce(settled_at, donated_at) desc limit 1
) lg on true
where d.deleted_at is null and d.merged_into is null;
revoke all on donor_summary from anon, authenticated;
