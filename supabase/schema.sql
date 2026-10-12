create extension if not exists pgcrypto;
create table if not exists public.reels(id uuid primary key default gen_random_uuid(),platform text not null check(platform in ('youtube','instagram','facebook','unknown')),url text not null check(char_length(url)<=2048),caption text not null default '' check(char_length(caption)<=180),shared_by text not null default 'A friend' check(char_length(shared_by)<=40),created_at timestamptz not null default now());
create index if not exists reels_created_at_idx on public.reels(created_at desc);
alter table public.reels enable row level security;
-- No public policies: the server API uses the service-role key after invite-token validation.
