-- Notification subscriptions, per-user preferences, and a send log for dedup.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default false,
  email_enabled boolean not null default false,
  email text,                       -- delivery address (anon users have no auth email)
  updated_at timestamptz not null default now()
);

create table public.notifications_sent (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,               -- e.g. 'lock'
  ref text not null,                -- match id
  channel text not null,            -- 'push' | 'email'
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref, channel)
);

-- RLS
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notifications_sent enable row level security;

-- A user manages only their own subscriptions + prefs. notifications_sent is
-- service-role only (no client policy -> deny), written by the dispatch job.
create policy "own push subs - select" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own push subs - insert" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "own push subs - delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create policy "own prefs - select" on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy "own prefs - insert" on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "own prefs - update" on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Least-privilege grants for these NEW tables (point-in-time grants in 0002 don't cover them).
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.notification_prefs to authenticated;
grant all on public.push_subscriptions to service_role;
grant all on public.notification_prefs to service_role;
grant all on public.notifications_sent to service_role;
