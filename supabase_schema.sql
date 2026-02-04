-- Create the table for applications if it doesn't exist
create table if not exists public.applications (
  id uuid not null default gen_random_uuid (),
  created_at timestamp with time zone not null default now(),
  status text null default 'new'::text,
  constraint applications_pkey primary key (id)
);

-- Safely add columns if they don't exist (Migration logic)
-- Using a separate block for each structure change to avoid parser issues
do $$
begin
  alter table public.applications add column if not exists child_name text null;
  alter table public.applications add column if not exists first_name text null;
  alter table public.applications add column if not exists last_name text null;
  alter table public.applications add column if not exists email text null;
  alter table public.applications add column if not exists age integer null;
  alter table public.applications add column if not exists phone text null;
  alter table public.applications add column if not exists post_code text null;
  alter table public.applications add column if not exists campaign_code text null;
  alter table public.applications add column if not exists gender text null;
  alter table public.applications add column if not exists city text null;
  alter table public.applications add column if not exists image_url text null;
  alter table public.applications add column if not exists crm_status text default 'pending';
  alter table public.applications add column if not exists crm_response text null;
end;
$$;

-- Add Unique Constraints to prevent duplicates
do $$
begin
  -- 1. Deduplicate Email (Keep latest)
  delete from public.applications a
  using (
      select id, row_number() over (partition by email order by created_at desc) as rn
      from public.applications
      where email is not null
  ) dup
  where a.id = dup.id and dup.rn > 1;

  -- 2. Deduplicate Phone (Keep latest)
  delete from public.applications a
  using (
      select id, row_number() over (partition by phone order by created_at desc) as rn
      from public.applications
      where phone is not null
  ) dup
  where a.id = dup.id and dup.rn > 1;

  -- 3. Add Email unique constraint
  if not exists (select 1 from pg_constraint where conname = 'applications_email_key') then
    alter table public.applications add constraint applications_email_key unique (email);
  end if;

  -- 4. Add Phone unique constraint
  if not exists (select 1 from pg_constraint where conname = 'applications_phone_key') then
    alter table public.applications add constraint applications_phone_key unique (phone);
  end if;
end $$;

-- Turn on Row Level Security (RLS)
alter table public.applications enable row level security;

-- Drop existing policies to avoid errors
drop policy if exists "Allow public inserts" on public.applications;

-- Create policy for inserts
create policy "Allow public inserts"
  on public.applications
  for insert
  to anon, authenticated
  with check (true);

-- Create policy to allow reading (Required for Dashboard)
drop policy if exists "Allow public reading" on public.applications;
create policy "Allow public reading"
  on public.applications
  for select
  to anon, authenticated
  using (true);


-- STORAGE SETUP

-- 1. Create bucket if not exists
insert into storage.buckets (id, name, public)
values ('leads', 'leads', true)
on conflict (id) do nothing;

-- 2. Drop existing storage policies
drop policy if exists "Allow public uploads" on storage.objects;
drop policy if exists "Allow public reading" on storage.objects;

-- 3. Create storage policies
create policy "Allow public uploads"
on storage.objects
for insert
to anon, authenticated
with check ( bucket_id = 'leads' );

create policy "Allow public reading"
on storage.objects
for select
to anon, authenticated
using ( bucket_id = 'leads' );
