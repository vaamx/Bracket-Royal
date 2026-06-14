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
