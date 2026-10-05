-- v4: новая простая модель (скрин + факторы). Выполнить один раз в Supabase -> SQL Editor -> Run.
-- Старые таблицы (setups, observations, screenshots) не трогаются. Таблица factors используется та же.
create table if not exists public.shots (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title      text not null default '',
  comment    text not null default '',
  result     text check (result in ('success','fail','unclear')),   -- задел на будущее (винрейт)
  path_full  text not null,
  path_thumb text not null,
  path_view  text,
  focus_x    real not null default 50,
  focus_y    real not null default 50,
  file_hash  text,
  created_at timestamptz not null default now()
);
alter table public.shots add column if not exists path_view text;
alter table public.shots add column if not exists focus_x real not null default 50;
alter table public.shots add column if not exists focus_y real not null default 50;

create index if not exists shots_hash_idx    on public.shots(user_id, file_hash);
create index if not exists shots_created_idx on public.shots(user_id, created_at desc);

create table if not exists public.shot_factors (
  shot_id   uuid not null references public.shots(id) on delete cascade,
  factor_id uuid not null references public.factors(id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (shot_id, factor_id)
);

grant select, insert, update, delete on public.shots, public.shot_factors to authenticated;
alter table public.shots        enable row level security;
alter table public.shot_factors enable row level security;
drop policy if exists "owner_all" on public.shots;
drop policy if exists "owner_all" on public.shot_factors;
create policy "owner_all" on public.shots        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner_all" on public.shot_factors for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
