-- Report builder (Reports → Report builder): saved report definitions. A report is private to the staff member who
-- saved it unless "Share with all staff" is ticked. The definition is validated by the app (definitionSchema) and
-- only names fields and filters; it never holds report results or donor data.
--
-- saved_reports already exists from 0001 (id, name, report_type, filters, created_by, created_at) but was never used,
-- so it is upgraded in place: new columns are added and the old ones kept, optional. Safe to run more than once.

create table if not exists saved_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table saved_reports add column if not exists definition jsonb;
alter table saved_reports add column if not exists shared boolean not null default false;
alter table saved_reports add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'saved_reports' and column_name = 'report_type') then
    alter table saved_reports alter column report_type drop not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'saved_reports' and column_name = 'filters') then
    alter table saved_reports alter column filters drop not null;
  end if;
end $$;
alter table saved_reports drop constraint if exists saved_reports_name_length;
alter table saved_reports add constraint saved_reports_name_length check (char_length(name) between 1 and 120);

create index if not exists saved_reports_owner_idx on saved_reports (created_by, name);
drop trigger if exists trg_saved_reports_upd on saved_reports;
create trigger trg_saved_reports_upd before update on saved_reports for each row execute function set_updated_at();

alter table saved_reports enable row level security;
-- 0002's policy let anyone with reports.view change any saved report; now only the owner can.
drop policy if exists reports_all on saved_reports;
drop policy if exists saved_reports_read on saved_reports;
create policy saved_reports_read on saved_reports for select using (has_permission('reports.view') and (shared or created_by = auth.uid()));
drop policy if exists saved_reports_write on saved_reports;
create policy saved_reports_write on saved_reports for all using (has_permission('reports.view') and created_by = auth.uid())
  with check (has_permission('reports.view') and created_by = auth.uid());
