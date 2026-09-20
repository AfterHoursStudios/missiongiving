-- Mission Giving: RBAC seed, helper functions, Row Level Security

-- ---------- permissions & system roles ----------
insert into permissions (key, description) values
 ('donors.view','View donor information'),
 ('donors.edit','Edit donor information'),
 ('finance.view','View financial information'),
 ('donors.export','Export donor data'),
 ('refunds.issue','Issue refunds'),
 ('tiers.manage','Manage donation tiers'),
 ('projects.manage','Manage projects'),
 ('expenses.record','Record expenses'),
 ('reports.view','View reports'),
 ('comms.send','Send bulk communications'),
 ('staff.manage','Manage staff users'),
 ('settings.manage','Modify organization settings'),
 ('audit.view','View audit logs')
on conflict do nothing;

insert into roles (key, name, description, is_system) values
 ('super_admin','Super Admin','Full access',true),
 ('finance_admin','Finance Administrator','Finance, refunds, expenses, reports',true),
 ('fundraising_manager','Fundraising Manager','Projects, tiers, donors, communications',true),
 ('donor_services','Donor Services','Donor support and record corrections',true),
 ('communications','Communications Staff','Messages and project announcements',true),
 ('read_only','Read-Only Reporter','View reports only',true)
on conflict do nothing;

insert into role_permissions (role_id, permission_key)
select r.id, p.key from roles r join permissions p on (
  r.key='super_admin'
  or (r.key='finance_admin' and p.key in ('finance.view','refunds.issue','expenses.record','reports.view','donors.view'))
  or (r.key='fundraising_manager' and p.key in ('donors.view','projects.manage','tiers.manage','comms.send','reports.view'))
  or (r.key='donor_services' and p.key in ('donors.view','donors.edit'))
  or (r.key='communications' and p.key in ('comms.send','projects.manage'))
  or (r.key='read_only' and p.key in ('reports.view'))
) on conflict do nothing;

-- ---------- helper functions (security definer, fixed search_path) ----------
create or replace function public.has_permission(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from staff_profiles sp
    join staff_role_assignments sra on sra.user_id = sp.user_id
    join role_permissions rp on rp.role_id = sra.role_id
    where sp.user_id = auth.uid() and sp.active and rp.permission_key = perm
  );
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_profiles where user_id = auth.uid() and active);
$$;

create or replace function public.current_donor_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from donor_profiles where user_id = auth.uid() and deleted_at is null;
$$;

-- New auth user -> profile row (donor_profiles are created at registration/donation by server code)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, first_name, last_name)
  values (new.id, new.email, new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- enable RLS everywhere ----------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- donor-owned data ----------
create policy profiles_self_read on profiles for select using (id = auth.uid() or has_permission('donors.view'));
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy donor_self_read on donor_profiles for select using (user_id = auth.uid() or has_permission('donors.view'));
-- Donors may update limited contact fields; status/stripe ids are protected by column grants below.
create policy donor_self_update on donor_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy donor_staff_update on donor_profiles for update using (has_permission('donors.edit')) with check (has_permission('donors.edit'));

create policy donations_read on donations for select
  using (donor_id = current_donor_id() or has_permission('finance.view') or has_permission('donors.view'));
create policy recurring_read on recurring_donations for select
  using (donor_id = current_donor_id() or has_permission('finance.view') or has_permission('donors.view'));
create policy receipts_read on receipts for select using (
  exists (select 1 from donations d where d.id = donation_id
          and (d.donor_id = current_donor_id() or has_permission('finance.view') or has_permission('donors.view'))));
create policy statements_read on annual_statements for select
  using (donor_id = current_donor_id() or has_permission('finance.view'));
create policy pm_read on payment_methods_metadata for select
  using (donor_id = current_donor_id() or has_permission('finance.view'));
create policy dedications_read on dedications for select using (
  exists (select 1 from donations d where d.id = donation_id
          and (d.donor_id = current_donor_id() or has_permission('donors.view'))));
create policy prefs_read on communication_preferences for select
  using (donor_id = current_donor_id() or has_permission('donors.view'));
create policy prefs_update on communication_preferences for update
  using (donor_id = current_donor_id()) with check (donor_id = current_donor_id());
create policy prefs_insert on communication_preferences for insert with check (donor_id = current_donor_id());

-- Donations, refunds, receipts are written ONLY by server code using the service role (no insert/update policies).
create policy refunds_read on refunds for select using (has_permission('finance.view'));
create policy disputes_read on disputes for select using (has_permission('finance.view'));

-- ---------- public catalog ----------
create policy funds_public on funds for select using (active or has_permission('projects.manage'));
create policy projects_public on projects for select
  using ((is_public and status in ('active','goal_reached','completed')) or has_permission('projects.manage'));
create policy projects_write on projects for all using (has_permission('projects.manage')) with check (has_permission('projects.manage'));
create policy updates_public on project_updates for select using (
  (published_at is not null and published_at <= now()
   and exists (select 1 from projects p where p.id = project_id and p.is_public))
  or has_permission('projects.manage'));
create policy updates_write on project_updates for all using (has_permission('projects.manage')) with check (has_permission('projects.manage'));
create policy tiers_public on donation_tiers for select using (status = 'active' or has_permission('tiers.manage'));
create policy tiers_write on donation_tiers for all using (has_permission('tiers.manage')) with check (has_permission('tiers.manage'));

-- ---------- staff-only ----------
create policy staff_self on staff_profiles for select using (user_id = auth.uid() or has_permission('staff.manage'));
create policy staff_manage on staff_profiles for all using (has_permission('staff.manage')) with check (has_permission('staff.manage'));
create policy roles_read on roles for select using (is_staff());
create policy perms_read on permissions for select using (is_staff());
create policy rp_read on role_permissions for select using (is_staff());
create policy rp_write on role_permissions for all using (has_permission('staff.manage')) with check (has_permission('staff.manage'));
create policy sra_read on staff_role_assignments for select using (user_id = auth.uid() or has_permission('staff.manage'));
create policy sra_write on staff_role_assignments for all using (has_permission('staff.manage')) with check (has_permission('staff.manage'));

create policy exp_cat_read on expense_categories for select using (has_permission('finance.view') or has_permission('expenses.record'));
create policy exp_cat_write on expense_categories for all using (has_permission('expenses.record')) with check (has_permission('expenses.record'));
create policy exp_read on expenses for select using (has_permission('finance.view') or has_permission('reports.view'));
create policy exp_write on expenses for insert with check (has_permission('expenses.record'));
create policy exp_update on expenses for update using (has_permission('expenses.record')) with check (has_permission('expenses.record'));
create policy budgets_all on budgets for all using (has_permission('finance.view')) with check (has_permission('expenses.record'));

create policy mt_read on message_templates for select using (has_permission('comms.send'));
create policy mt_write on message_templates for all using (has_permission('comms.send')) with check (has_permission('comms.send'));
create policy mtv_all on message_template_versions for all using (has_permission('comms.send')) with check (has_permission('comms.send'));
create policy camp_all on communication_campaigns for all using (has_permission('comms.send')) with check (has_permission('comms.send'));
create policy camprec_read on campaign_recipients for select using (has_permission('comms.send'));
create policy evt_read on email_events for select using (has_permission('comms.send'));

create policy tags_read on donor_tags for select using (has_permission('donors.view'));
create policy tags_write on donor_tags for all using (has_permission('donors.edit')) with check (has_permission('donors.edit'));
create policy tagassign_read on donor_tag_assignments for select using (has_permission('donors.view'));
create policy tagassign_write on donor_tag_assignments for all using (has_permission('donors.edit')) with check (has_permission('donors.edit'));
create policy notes_read on donor_notes for select using (has_permission('donors.view'));
create policy notes_insert on donor_notes for insert with check (has_permission('donors.edit'));

-- public-safe settings are exposed via server code; direct reads require permission
create policy settings_read on organization_settings for select using (has_permission('settings.manage'));
create policy settings_write on organization_settings for all using (has_permission('settings.manage')) with check (has_permission('settings.manage'));

create policy audit_read on audit_logs for select using (has_permission('audit.view'));
-- no insert policy: audit rows are written by server code (service role) or security-definer functions.
-- webhook_events: no policies => service role only.
create policy reports_all on saved_reports for all using (has_permission('reports.view')) with check (has_permission('reports.view'));

-- ---------- column-level protection for donor self-updates ----------
revoke update on donor_profiles from authenticated;
grant update (first_name, last_name, phone, address_line1, address_line2, city, region, postal_code, country, public_recognition)
  on donor_profiles to authenticated;
revoke update on profiles from authenticated;
grant update (first_name, last_name, phone) on profiles to authenticated;

-- ---------- default settings ----------
insert into organization_settings (key, value) values
 ('legal_name','"Ultimate Mission (LEGAL NAME - CONFIRM)"'),
 ('brand_name','"Mission Giving"'),
 ('ein','""'),
 ('mailing_address','"P.O. Box 607, Gladstone OR 97027"'),
 ('phone','"971-356-6789"'),
 ('website','"https://www.ultimatemission.org/"'),
 ('currency','"USD"'),
 ('timezone','"America/Los_Angeles"'),
 ('fiscal_year_start_month','1'),
 ('guest_donations_enabled','false'),
 ('custom_amount_enabled','true'),
 ('min_donation_cents','500'),
 ('max_donation_cents','5000000'),
 ('public_recognition_enabled','false'),
 ('no_goods_or_services_statement','"PLACEHOLDER - pending Ultimate Mission / legal review."'),
 ('tax_acknowledgment','"PLACEHOLDER - pending Ultimate Mission / legal review."')
on conflict do nothing;
