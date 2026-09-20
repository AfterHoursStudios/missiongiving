-- Phase 4a: donor CRM support

-- Aggregated donor list. Only reachable through server code that has already checked `donors.view`;
-- direct access from browser roles is revoked.
create view donor_summary as
select
  d.id, d.user_id, d.first_name, d.last_name, d.email, d.phone, d.status, d.organization_name, d.created_at,
  coalesce(s.lifetime_cents, 0)::bigint as lifetime_cents,
  s.first_gift_at, s.last_gift_at,
  coalesce(s.gift_count, 0)::int as gift_count,
  coalesce(r.active_recurring, 0)::int as active_recurring
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

-- Atomic donor merge. Callable only with the service role; the app layer checks permissions, requires
-- confirmation and writes the audit entry. Nothing is deleted: the secondary record is soft-deleted and
-- points at the primary, and all financial rows are re-pointed.
create or replace function public.merge_donors(p_primary uuid, p_secondary uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_don int; n_rec int; sec_user uuid; prim record; sec record;
begin
  if p_primary = p_secondary then raise exception 'Cannot merge a donor into itself'; end if;
  select * into prim from donor_profiles where id = p_primary and deleted_at is null and merged_into is null for update;
  select * into sec from donor_profiles where id = p_secondary and deleted_at is null and merged_into is null for update;
  if prim.id is null or sec.id is null then raise exception 'Both donor records must exist and be active'; end if;

  update donations set donor_id = p_primary where donor_id = p_secondary; get diagnostics n_don = row_count;
  update recurring_donations set donor_id = p_primary where donor_id = p_secondary; get diagnostics n_rec = row_count;
  update payment_methods_metadata set donor_id = p_primary where donor_id = p_secondary;
  update donor_notes set donor_id = p_primary where donor_id = p_secondary;
  update data_requests set donor_id = p_primary where donor_id = p_secondary;
  delete from annual_statements where donor_id = p_secondary; -- derived data; regenerated on demand

  insert into donor_tag_assignments (donor_id, tag_id)
    select p_primary, tag_id from donor_tag_assignments where donor_id = p_secondary on conflict do nothing;
  delete from donor_tag_assignments where donor_id = p_secondary;

  -- Consent: the most restrictive choice wins (opt-out is never overridden by a merge).
  insert into communication_preferences (donor_id, marketing_email, project_updates, annual_statement_email, suppressed, suppressed_reason)
    select p_primary, marketing_email, project_updates, annual_statement_email, suppressed, suppressed_reason
    from communication_preferences where donor_id = p_secondary
  on conflict (donor_id) do update set
    marketing_email = communication_preferences.marketing_email and excluded.marketing_email,
    project_updates = communication_preferences.project_updates and excluded.project_updates,
    annual_statement_email = communication_preferences.annual_statement_email and excluded.annual_statement_email,
    suppressed = communication_preferences.suppressed or excluded.suppressed;
  delete from communication_preferences where donor_id = p_secondary;

  sec_user := sec.user_id;
  update donor_profiles set user_id = null where id = p_secondary;
  update donor_profiles set user_id = sec_user where id = p_primary and user_id is null and sec_user is not null;
  update donor_profiles set merged_into = p_primary, deleted_at = now(), status = 'inactive' where id = p_secondary;

  insert into donor_notes (donor_id, body) values
    (p_primary, format('Merged donor record %s (%s %s, %s) into this record: %s donations, %s recurring gifts moved.',
      p_secondary, sec.first_name, sec.last_name, sec.email, n_don, n_rec));
  return jsonb_build_object('donations_moved', n_don, 'recurring_moved', n_rec, 'secondary', p_secondary);
end $$;
revoke execute on function public.merge_donors(uuid, uuid) from public, anon, authenticated;
