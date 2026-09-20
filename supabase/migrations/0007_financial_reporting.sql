-- Phase 5: financial reporting

-- Functional expense class for the Statement of Activities (program / fundraising / management & general).
alter table expense_categories add column if not exists functional_class text not null default 'management'
  check (functional_class in ('program','fundraising','management'));
update expense_categories set functional_class = case
  when is_program then 'program'
  when name ilike '%fundrais%' then 'fundraising'
  else 'management' end
where functional_class = 'management';

-- One budget line per category (or project) per fiscal year. Fiscal year = the calendar year in which it STARTS.
create unique index if not exists budgets_category_year_uq on budgets (fiscal_year, category_id) where project_id is null and category_id is not null;
create policy budgets_read_reports on budgets for select using (has_permission('reports.view'));

-- Private bucket for expense receipt attachments. No storage policies are created, so only the service role
-- (server code that has checked permissions) can read or write; browsers never get direct access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 5242880, array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Refund rows: the app inserts one when a refund is submitted to Stripe; webhooks remain authoritative for donation totals.
create index if not exists refunds_donation_idx on refunds (donation_id);
