-- Phase 4b: privacy request fulfilment

-- Anonymizes a donor for an approved deletion request. Gift amounts, dates, statuses and receipts are RETAINED
-- (financial/tax record keeping); everything that identifies the person is removed. Atomic; service role only.
create or replace function public.anonymize_donor(p_donor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if exists (select 1 from recurring_donations where donor_id = p_donor and status in ('active','past_due','incomplete','paused')) then
    raise exception 'active_recurring';
  end if;
  select user_id into uid from donor_profiles where id = p_donor and deleted_at is null for update;
  if not found then raise exception 'donor_not_found'; end if;

  update donor_profiles set
    first_name = 'Deleted', last_name = 'Donor',
    email = 'deleted-' || id || '@invalid.example', normalized_email = 'deleted-' || id || '@invalid.example',
    phone = null, address_line1 = null, address_line2 = null, city = null, region = null, postal_code = null,
    organization_name = null, public_recognition = false, user_id = null, status = 'inactive', deleted_at = now()
  where id = p_donor;

  delete from donor_notes where donor_id = p_donor;
  delete from donor_tag_assignments where donor_id = p_donor;
  update donations set donor_note = null, anonymous = true where donor_id = p_donor;
  update dedications set name = '[removed]', message = null, notify_email = null
    where donation_id in (select id from donations where donor_id = p_donor);
  insert into communication_preferences (donor_id, marketing_email, project_updates, annual_statement_email, suppressed, suppressed_reason)
    values (p_donor, false, false, false, true, 'account_deleted')
  on conflict (donor_id) do update set marketing_email = false, project_updates = false, annual_statement_email = false,
    suppressed = true, suppressed_reason = 'account_deleted';
  update data_requests set status = 'completed', resolved_at = now()
    where donor_id = p_donor and kind = 'deletion' and status in ('open','in_progress');
  return jsonb_build_object('auth_user_id', uid);
end $$;
revoke execute on function public.anonymize_donor(uuid) from public, anon, authenticated;

-- Unique constraint so a project can never share a slug with another.
create unique index if not exists project_updates_project_idx on project_updates (project_id, published_at desc);
