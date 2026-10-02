-- Permanent donor deletion: removes the donor and EVERY record tied to them, including donations, receipts and
-- recurring gifts. Unlike anonymize_donor (0006), nothing is retained, so this is limited to a new permission that
-- only Super Admins hold by default.

insert into permissions (key, description) values ('donors.delete', 'Permanently delete donors and all their gifts')
on conflict (key) do nothing;
insert into role_permissions (role_id, permission_key)
select id, 'donors.delete' from roles where key = 'super_admin'
on conflict do nothing;

-- Financial rows still can't be hard-deleted, except inside delete_donor_completely, which sets this flag for its
-- own transaction only. Browser roles cannot run set_config, so they cannot use the bypass.
create or replace function public.forbid_delete() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.allow_financial_delete', true), '') = 'on' then return old; end if;
  raise exception 'Hard deletes are not permitted on %', tg_table_name;
end $$;

-- Atomic; service role only. The app cancels the donor's Stripe subscriptions first, writes the audit entry and
-- removes a donor-only sign-in account using the returned auth_user_id.
create or replace function public.delete_donor_completely(p_donor uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid; n_don int; n_rec int;
begin
  select user_id into uid from donor_profiles where id = p_donor for update;
  if not found then raise exception 'donor_not_found'; end if;

  perform set_config('app.allow_financial_delete', 'on', true);

  if to_regclass('public.donor_communications') is not null then
    execute 'delete from donor_communications where donor_id = $1 or donation_id in (select id from donations where donor_id = $1)' using p_donor;
  end if;
  delete from receipts    where donation_id in (select id from donations where donor_id = p_donor);
  delete from refunds     where donation_id in (select id from donations where donor_id = p_donor);
  delete from disputes    where donation_id in (select id from donations where donor_id = p_donor);
  delete from dedications where donation_id in (select id from donations where donor_id = p_donor);
  delete from donations where donor_id = p_donor; get diagnostics n_don = row_count;
  delete from recurring_donations where donor_id = p_donor; get diagnostics n_rec = row_count;
  delete from payment_methods_metadata where donor_id = p_donor;
  delete from campaign_recipients where donor_id = p_donor;
  delete from annual_statements where donor_id = p_donor;
  delete from data_requests where donor_id = p_donor;
  update donor_profiles set merged_into = null where merged_into = p_donor;
  delete from donor_profiles where id = p_donor; -- notes, tags, preferences and to-dos cascade

  perform set_config('app.allow_financial_delete', 'off', true);
  return jsonb_build_object('auth_user_id', uid, 'donations_deleted', n_don, 'recurring_deleted', n_rec);
end $$;
revoke execute on function public.delete_donor_completely(uuid) from public, anon, authenticated;
