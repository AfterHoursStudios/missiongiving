-- Staff to-dos that aren't tied to a donor ("Add New → To-do"): a title, due date and assignee. They share the
-- donor_todos table so they appear in the same "My to-dos" list on the dashboard.

alter table donor_todos alter column donor_id drop not null;
alter table donor_todos add column if not exists title text check (char_length(title) <= 200);

alter table donor_todos drop constraint if exists donor_todos_activity_check;
alter table donor_todos add constraint donor_todos_activity_check
  check (activity in ('thank_you_call','phone_call','send_letter','send_email','meeting','follow_up','other','task'));

-- Every to-do is either about a donor or has its own title.
alter table donor_todos drop constraint if exists donor_todos_subject_check;
alter table donor_todos add constraint donor_todos_subject_check check (donor_id is not null or nullif(trim(title), '') is not null);
