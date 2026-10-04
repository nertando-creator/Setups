-- v3: папки для сетапов. Выполнить один раз в Supabase -> SQL Editor -> Run
create table if not exists public.folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
alter table public.setups add column if not exists folder_id uuid references public.folders(id) on delete set null;
grant select, insert, update, delete on public.folders to authenticated;
alter table public.folders enable row level security;
drop policy if exists "owner_all" on public.folders;
create policy "owner_all" on public.folders for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
