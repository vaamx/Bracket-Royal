-- ===== supabase/migrations/0001_core_schema.sql =====
-- Core schema for World Cup 2026 predictions (Phase 1).

create table public.teams (
  id text primary key,                 -- 3-letter code, e.g. 'MEX'
  name text not null,
  flag text,
  group_label text,                    -- 'A'..'L', nullable until draw ingested
  fifa_rank int
);

create table public.matches (
  id text primary key,
  stage text not null check (stage in ('group','r32','r16','qf','sf','final','third')),
  group_label text,
  bracket_slot text,                   -- e.g. '1A','2B','W74', null for groups
  home_team_id text references public.teams(id),
  away_team_id text references public.teams(id),
  kickoff_at timestamptz,
  lock_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','live','final')),
  home_score int,
  away_score int,
  winner_team_id text references public.teams(id),
  venue text
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  owner_id uuid references public.profiles(id),
  scoring_config jsonb not null default
    '{"exact":5,"goalDiff":3,"outcome":2,"qualWinner":3,"qualTop2":2,"qualThird":2,"ko":{"r32":10,"r16":15,"qf":25,"sf":40,"champion":60,"exactBonus":3}}'::jsonb,
  is_global boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid references public.leagues(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id text not null references public.matches(id),
  predicted_home int,
  predicted_away int,
  predicted_winner_team_id text references public.teams(id),
  locked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create table public.league_standings (
  league_id uuid references public.leagues(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  points int not null default 0,
  rank int,
  exact_count int not null default 0,
  streak int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table public.achievements (
  user_id uuid references public.profiles(id) on delete cascade,
  badge_key text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

-- Enable Row Level Security (policies are added in the Auth & Leagues plan).
alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.predictions enable row level security;
alter table public.league_standings enable row level security;
alter table public.achievements enable row level security;

-- Reference data (teams, matches) is world-readable.
alter table public.teams enable row level security;
alter table public.matches enable row level security;
create policy "teams readable by all" on public.teams for select using (true);
create policy "matches readable by all" on public.matches for select using (true);

-- ===== supabase/migrations/0002_auth_leagues_rls.sql =====
-- Auth provisioning + leagues access model for World Cup 2026 predictions.

-- 1. The global league everyone joins automatically.
insert into public.leagues (id, name, invite_code, owner_id, is_global)
values ('00000000-0000-0000-0000-000000000001', 'Global', 'GLOBAL', null, true)
on conflict (id) do nothing;

-- 2. Provision a profile + global membership when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.league_members (league_id, user_id)
  values ('00000000-0000-0000-0000-000000000001', new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. SECURITY DEFINER membership helper (avoids recursive RLS on league_members).
create or replace function public.is_member(p_league uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league and user_id = auth.uid()
  );
$$;

-- 4. Base table privileges. RLS only *narrows* access for roles that already
-- hold table GRANTs; without these, every API query is denied at the privilege
-- layer (error 42501) before any policy is evaluated. The tables in 0001 were
-- created without DML grants for the Supabase API roles, so grant them here.
-- Least-privilege: grant only what some RLS policy can actually permit. anon never
-- writes (no anon write policy exists); authenticated needs select/insert/update but
-- no policy ever permits delete; service_role bypasses RLS and gets everything.
grant select on all tables in schema public to anon;
grant select, insert, update on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- 5. RLS policies.

-- profiles: any authenticated user can read profiles (needed for leaderboards);
-- a user may update only their own. Inserts happen via the trigger (definer).
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "profiles updatable by owner"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- leagues: visible if global, you own it, or you're a member; create as
-- yourself; owner updates. (The owner clause lets a creator read their league
-- back immediately on insert-returning, before the league_members row exists.)
create policy "leagues visible to members or global"
  on public.leagues for select to authenticated
  using (is_global or owner_id = auth.uid() or public.is_member(id));
create policy "leagues created by owner"
  on public.leagues for insert to authenticated
  with check (owner_id = auth.uid());
create policy "leagues updated by owner"
  on public.leagues for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- league_members: see co-members of your leagues; add only yourself.
create policy "members visible to fellow members"
  on public.league_members for select to authenticated
  using (public.is_member(league_id));
create policy "members can add themselves"
  on public.league_members for insert to authenticated
  with check (user_id = auth.uid());

-- league_standings: members can read; writes are service-role only (no write policy).
create policy "standings visible to members"
  on public.league_standings for select to authenticated
  using (public.is_member(league_id));

-- achievements: a user can read their own; writes are service-role only.
create policy "own achievements readable"
  on public.achievements for select to authenticated
  using (user_id = auth.uid());

-- predictions: a user reads only their own; may write only their own AND only
-- until the match is final (open until full-time — see 0010_open_until_final.sql).
create policy "own predictions readable"
  on public.predictions for select to authenticated
  using (user_id = auth.uid());
create policy "own predictions insertable until final"
  on public.predictions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.status <> 'final'
    )
  );
create policy "own predictions updatable until final"
  on public.predictions for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and m.status <> 'final'
    )
  );

-- 6. Join-by-code RPC: looks up a league by code without exposing it via RLS,
-- then adds the caller as a member. Returns the joined league.
create or replace function public.join_league_by_code(p_code text)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leagues;
begin
  select * into l from public.leagues where invite_code = upper(trim(p_code));
  if l.id is null then
    raise exception 'League not found' using errcode = 'no_data_found';
  end if;
  insert into public.league_members (league_id, user_id)
  values (l.id, auth.uid())
  on conflict do nothing;
  return l;
end;
$$;

revoke all on function public.join_league_by_code(text) from public;
grant execute on function public.join_league_by_code(text) to authenticated;

-- ===== supabase/migrations/0003_matches_matchday.sql =====
-- Group-stage matchday (1..3), used to order and label match rows in the
-- prediction UI. Nullable: knockout matches have no matchday, and ad-hoc inserts
-- (e.g. integration-test fixtures) may omit it.
alter table public.matches add column if not exists matchday int;

-- ===== supabase/migrations/0004_realtime_standings.sql =====
-- Stream standings + live match changes to clients via Supabase Realtime.
alter publication supabase_realtime add table public.league_standings;
alter publication supabase_realtime add table public.matches;

-- ===== supabase/migrations/0005_notifications.sql =====
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

