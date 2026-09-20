-- Project image uploads. Public-read (these images appear on the public website); no storage policies are created,
-- so only server code using the service role can write or delete. Uploads are re-encoded to WebP by the app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', true, 5242880, array['image/webp'])
on conflict (id) do nothing;
