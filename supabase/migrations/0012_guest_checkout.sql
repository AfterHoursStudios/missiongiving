-- Guest checkout: a one-time gift no longer requires an account (recurring gifts still do, since they need a
-- dashboard to manage or cancel). A guest's donor_profiles row is created with user_id null, matched by email on
-- repeat guest gifts (see startCheckout). When they later create an account with that same, verified email, this
-- claims that row automatically so their existing giving history and updates appear right away.
--
-- Only ever claims a currently UNCLAIMED row (user_id is null), and picks at most one match: donor_profiles.user_id
-- is unique, so updating more than one row to the same new user_id would fail this trigger (and so the signup
-- itself). Any leftover duplicate guest rows for the same email are for the admin "Find duplicates" tool, same as
-- duplicates created by offline gifts today.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, first_name, last_name)
  values (new.id, new.email, new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'last_name');

  update donor_profiles set user_id = new.id
    where id = (
      select id from donor_profiles
      where user_id is null and normalized_email = new.email and deleted_at is null
      order by created_at desc limit 1
    );

  return new;
end $$;
