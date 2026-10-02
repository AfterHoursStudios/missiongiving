-- New donors start opted in to news emails, project updates and the annual statement email, however they're created
-- (admin "Add donor", registration, a guest gift, a phone/offline gift, an import). They can opt out any time, and
-- unsubscribes, spam complaints and bounces still always block email. Existing donors' choices are not changed.

alter table communication_preferences alter column marketing_email set default true;
alter table communication_preferences alter column project_updates set default true;
alter table communication_preferences alter column annual_statement_email set default true;

create or replace function public.default_contact_preferences() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into communication_preferences (donor_id) values (new.id) on conflict (donor_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_donor_default_prefs on donor_profiles;
create trigger trg_donor_default_prefs after insert on donor_profiles for each row execute function public.default_contact_preferences();
