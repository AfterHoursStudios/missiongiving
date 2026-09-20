-- Phase 3: donor portal support

-- Donor-initiated privacy requests. Deletion is REVIEWED by staff: financial records must be retained,
-- so approval anonymizes personal data rather than hard-deleting donation history.
create table data_requests (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references donor_profiles(id),
  kind text not null check (kind in ('deletion','export')),
  status text not null default 'open' check (status in ('open','in_progress','completed','rejected')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by uuid references profiles(id)
);
create unique index data_requests_one_open_deletion on data_requests (donor_id) where kind = 'deletion' and status in ('open','in_progress');
alter table data_requests enable row level security;
create policy dr_donor_read on data_requests for select using (donor_id = current_donor_id() or has_permission('donors.edit'));
create policy dr_donor_insert on data_requests for insert with check (donor_id = current_donor_id() and status = 'open');
create policy dr_staff_update on data_requests for update using (has_permission('donors.edit')) with check (has_permission('donors.edit'));

-- Donors may read their own recurring/annual records already (0002). Statements are generated on demand.
create policy statements_insert on annual_statements for insert with check (donor_id = current_donor_id());
create policy statements_update on annual_statements for update using (donor_id = current_donor_id()) with check (donor_id = current_donor_id());

insert into organization_settings (key, value) values
 ('recurring_amount_change_enabled','true'),
 ('email_sender_name','"Mission Giving"'),
 ('email_reply_to','""'),
 ('default_thank_you','"Thank you for your generous gift."')
on conflict do nothing;
