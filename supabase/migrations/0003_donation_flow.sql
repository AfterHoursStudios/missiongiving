-- Phase 2: donation flow support
-- A subscription exists in Stripe before its first payment is confirmed.
alter type recurring_status add value if not exists 'incomplete';

-- Public-safe aggregate for project progress and donor counts (no donor identities exposed).
create or replace function public.project_totals(p_project_id uuid)
returns table (raised_cents bigint, donor_count bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(d.amount_cents - d.refunded_cents), 0)::bigint,
         count(distinct d.donor_id)::bigint
  from donations d
  where d.project_id = p_project_id
    and d.status in ('succeeded','partially_refunded','refunded');
$$;
grant execute on function public.project_totals(uuid) to anon, authenticated;
