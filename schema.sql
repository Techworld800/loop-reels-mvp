create extension if not exists pgcrypto;
create table if not exists public.reels(id uuid primary key default gen_random_uuid(),platform text not null check(platform in ('youtube','instagram','facebook','unknown')),url text not null check(char_length(url)<=2048),caption text not null default '' check(char_length(caption)<=180),shared_by text not null default 'A friend' check(char_length(shared_by)<=40),created_at timestamptz not null default now());
create index if not exists reels_created_at_idx on public.reels(created_at desc);
alter table public.reels enable row level security;
-- No public policies: the public server API accesses this table using the server-only service-role key.

-- Web Push subscriptions (one row per subscribed browser/device).
create table if not exists public.push_subscriptions(endpoint text primary key check(char_length(endpoint)<=2048),p256dh text not null,auth text not null,created_at timestamptz not null default now());
alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
grant select, insert, update, delete on table public.reels to service_role;

-- Reactions: one row per (reel, device, emoji). Devices are anonymous random ids.
create table if not exists public.reactions(reel_id uuid not null references public.reels(id) on delete cascade,device_id text not null check(char_length(device_id) between 8 and 64),emoji text not null check(char_length(emoji)<=8),created_at timestamptz not null default now(),primary key(reel_id,device_id,emoji));
create index if not exists reactions_reel_idx on public.reactions(reel_id);
alter table public.reactions enable row level security;
grant select, insert, update, delete on table public.reactions to service_role;
create or replace view public.reaction_counts as select reel_id, emoji, count(*)::int as n from public.reactions group by reel_id, emoji;
revoke all on public.reaction_counts from anon, authenticated;
grant select on public.reaction_counts to service_role;
