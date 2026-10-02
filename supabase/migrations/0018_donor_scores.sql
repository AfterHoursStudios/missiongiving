-- Donor score (0–100), always current: Recency 40% + Frequency 30% + Monetary 30%.
-- Same rules as src/lib/admin/donor-score.ts (the tested reference):
--   recency   = 100 × max(0, 1 − days_since_last_gift / 730), last gift made here or in DonorPerfect (0016)
--   frequency = percentile of gifts made here in the last 730 days, among donors who gave in that window
--   monetary  = percentile of the net amount given here in the last 730 days, ranked the same way
--   donor_score = round(0.4 × recency + 0.3 × frequency + 0.3 × monetary)
-- Days are counted in UTC. Fully refunded gifts don't count.

create or replace view donor_scores as
with gifts as (
  select donor_id, amount_cents - refunded_cents as net, (coalesce(settled_at, donated_at) at time zone 'UTC')::date as day
  from donations
  where status in ('succeeded','partially_refunded','refunded') and amount_cents - refunded_cents > 0
),
base as (
  select d.id as donor_id,
    count(g.day) filter (where g.day >= (now() at time zone 'UTC')::date - 730) as gifts_24m,
    coalesce(sum(g.net) filter (where g.day >= (now() at time zone 'UTC')::date - 730), 0) as given_24m_cents,
    greatest(max(g.day), d.dp_last_gift_at) as last_gift_day
  from donor_profiles d
  left join gifts g on g.donor_id = d.id
  where d.deleted_at is null and d.merged_into is null
  group by d.id, d.dp_last_gift_at
),
scored as (
  select b.*,
    case when last_gift_day is null then 0
         else 100 * greatest(0, 1 - greatest(0, (now() at time zone 'UTC')::date - last_gift_day)::numeric / 730) end as recency_score,
    case when gifts_24m > 0 then 100 * cume_dist() over (partition by gifts_24m > 0 order by gifts_24m) else 0 end as frequency_score,
    case when given_24m_cents > 0 then 100 * cume_dist() over (partition by given_24m_cents > 0 order by given_24m_cents) else 0 end as monetary_score
  from base b
)
select donor_id, gifts_24m::int, given_24m_cents::bigint, last_gift_day,
  round(recency_score::numeric, 1) as recency_score,
  round(frequency_score::numeric, 1) as frequency_score,
  round(monetary_score::numeric, 1) as monetary_score,
  round(0.4 * recency_score + 0.3 * frequency_score + 0.3 * monetary_score)::int as donor_score
from scored;
revoke all on donor_scores from anon, authenticated;

-- Donor list: append the score (existing columns keep their positions).
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
       then lg.amount_cents else d.dp_last_gift_cents end as latest_gift_cents,
  sc.donor_score, sc.recency_score, sc.frequency_score, sc.monetary_score
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
left join donor_scores sc on sc.donor_id = d.id
where d.deleted_at is null and d.merged_into is null;
revoke all on donor_summary from anon, authenticated;
